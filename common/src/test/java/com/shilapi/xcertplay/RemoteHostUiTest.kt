package com.shilapi.xcertplay

import android.app.Activity
import android.content.ClipboardManager
import android.content.Intent
import android.os.Looper
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ScrollView
import android.widget.TextView
import com.shilapi.xcertplay.airplay.AirPlayConfig
import com.shilapi.xcertplay.airplay.MediaSink
import com.shilapi.xcertplay.host.R
import com.shilapi.xcertplay.orchestration.CarPlayController
import java.nio.file.Files
import java.nio.file.Paths
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.android.controller.ActivityController
import org.robolectric.util.ReflectionHelpers
import org.robolectric.shadows.ShadowAlertDialog
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29], qualifiers = "zh-rCN-w390dp-h844dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class RemoteHostUiTest {
    private var controller: ActivityController<Activity>? = null
    private var hostController: ActivityController<DiPlayActivity>? = null
    private val output = Output()
    private var wirelessStarts = 0
    private var nextSteps = 0
    private var completed = 0

    @After fun finish() {
        controller?.pause()?.stop()?.destroy()
        hostController?.pause()?.stop()?.destroy()
        CarPlayOutput.extension = null
        RuntimeEnvironment.setFontScale(1f)
        AppAppearanceRuntime.resetForTest()
        RuntimeEnvironment.getApplication().getSharedPreferences("diplay", 0).edit().clear().commit()
        RuntimeEnvironment.getApplication().getSharedPreferences("xcertplay_airplay", 0).edit().clear().commit()
    }

    @Test fun realActivityUsesTheHostHomeAndReturnsToTheSameSetupStep() {
        val context = RuntimeEnvironment.getApplication()
        CarPlayOutput.extension = output
        DiPlayPreferences.savePhone(context, "00:11:22:33:44:55", "iPhone 17 Pro Max")
        AirPlayPersistence.saveAppAppearance(context, AppAppearance.DARK)
        hostController = Robolectric.buildActivity(DiPlayActivity::class.java,
            Intent(context, DiPlayActivity::class.java).putExtra("page", "home")).setup()
        val activity = hostController!!.get()
        ReflectionHelpers.setField(activity, "setupError", null)
        ReflectionHelpers.callInstanceMethod<Unit>(activity, "render")
        var root = activity.findViewById<ViewGroup>(android.R.id.content).getChildAt(0)
        layout(root)
        assertTrue(descendants(root).filterIsInstance<TextView>().any { it.text == "482 916" })
        assertFalse(descendants(root).filterIsInstance<TextView>().any { it.text.contains("DiLink") })
        writeScreenshot(root, "activity-home-zh")
        descendants(root).single { it.contentDescription?.toString()?.contains("iPhone 17 Pro Max ·") == true }.performClick()
        val phoneMenu = ShadowAlertDialog.getLatestAlertDialog()
        assertEquals(3, phoneMenu.listView.adapter.count)
        assertEquals(activity.getString(R.string.connect_with_usb), phoneMenu.listView.adapter.getItem(2))
        phoneMenu.dismiss()
        ReflectionHelpers.setField(activity, "page", "setup")
        ReflectionHelpers.setField(activity, "setupStep", 0)
        ReflectionHelpers.callInstanceMethod<Unit>(activity, "render")
        root = activity.findViewById<ViewGroup>(android.R.id.content).getChildAt(0)
        descendants(root).single { it.contentDescription == activity.getString(R.string.connection_setup) }.performClick()
        assertEquals("connection", ReflectionHelpers.getField<String>(activity, "page"))
        ReflectionHelpers.callInstanceMethod<Unit>(activity, "navigateBack")
        assertEquals("setup", ReflectionHelpers.getField<String>(activity, "page"))
        assertEquals(0, ReflectionHelpers.getField<Int>(activity, "setupStep"))
    }

    @Test @Config(qualifiers = "zh-rCN-w320dp-h500dp-xhdpi")
    fun setupStepNavigationStartsAtTheTopOnASmallHostScreen() {
        val context = RuntimeEnvironment.getApplication()
        CarPlayOutput.extension = output
        hostController = Robolectric.buildActivity(DiPlayActivity::class.java,
            Intent(context, DiPlayActivity::class.java).putExtra("page", "home")).setup()
        val activity = hostController!!.get()
        ReflectionHelpers.setField(activity, "page", "setup")
        ReflectionHelpers.setField(activity, "setupStep", 0)
        ReflectionHelpers.callInstanceMethod<Unit>(activity, "render")
        fun root(): View {
            val root = activity.findViewById<ViewGroup>(android.R.id.content).getChildAt(0)
            layout(root)
            shadowOf(Looper.getMainLooper()).idle()
            return root
        }
        var root = root()
        var scroll = ReflectionHelpers.getField<ScrollView>(activity, "rootScroll")
        scroll.scrollTo(0, 100)
        assertTrue(scroll.scrollY > 0)
        button(root, activity.getString(R.string.setup_next)).performClick()
        root = root()
        scroll = ReflectionHelpers.getField(activity, "rootScroll")
        assertEquals(0, scroll.scrollY)
        scroll.scrollTo(0, 100)
        assertTrue(scroll.scrollY > 0)
        button(root, activity.getString(R.string.back)).performClick()
        root()
        assertEquals(0, ReflectionHelpers.getField<ScrollView>(activity, "rootScroll").scrollY)
    }

    @Test fun dashboardCopiesTheAddressWithoutTokensAndExpiryRequiresAnExplicitRenewal() {
        val (activity, ui, root) = screen()
        assertEquals(1, output.opened)
        repeat(5) { ui.refresh() }
        assertEquals(1, output.opened)
        button(root, activity.getString(R.string.settings_host_copy_address)).performClick()
        val clipboard = activity.getSystemService(ClipboardManager::class.java)
        assertEquals("https://carplay.example", clipboard.primaryClip!!.getItemAt(0).text)
        assertEquals(0, wirelessStarts)
        output.snapshot = output.snapshot.copy(pairingCode = null)
        ui.refresh()
        assertTrue(descendants(root).filterIsInstance<TextView>().any { it.text == activity.getString(R.string.settings_host_code_expired) })
        button(root, activity.getString(R.string.settings_host_code_renew)).performClick()
        assertEquals(1, output.renewed)
        assertTrue(descendants(root).filterIsInstance<TextView>().any { it.text == "975 310" })
    }

    @Test fun firstSetupUsesHostAndBrowserTasksWithoutVehicleGenerationOrImplicitConnect() {
        for (step in 0 until RemoteHostUi.SETUP_STEPS) {
            val (activity, _, root) = screen(step)
            assertFalse(descendants(root).filterIsInstance<TextView>().any { it.text.contains("DiLink") })
            button(root, activity.getString(if (step == RemoteHostUi.SETUP_STEPS - 1) R.string.done else R.string.setup_next)).performClick()
            controller?.pause()?.stop()?.destroy(); controller = null
        }
        assertEquals(3, nextSteps)
        assertEquals(1, completed)
        assertEquals(0, wirelessStarts)
    }

    @Test fun referencePortraitScreenshot() = capture("home-reference-zh", 1f)
    @Test fun compactLargeFontScreenshot() = capture("home-compact-zh-font130", 1.3f)

    @Test @Config(qualifiers = "en-w1000dp-h800dp-xhdpi")
    fun fullLargeFontScreenshot() = capture("home-full-en-font130", 1.3f)

    @Test @Config(qualifiers = "ar-w360dp-h800dp-xhdpi")
    fun arabicRtlLargeFontScreenshot() = capture("home-compact-ar-font130", 1.3f)

    @Test fun firstSetupScreenshot() = capture("setup-entry-zh-font130", 1.3f, step = 2)

    @Test @Config(qualifiers = "en-w1000dp-h800dp-xhdpi")
    fun firstSetupFullScreenshot() = capture("setup-entry-full-en-font130", 1.3f, step = 2)

    @Test @Config(qualifiers = "ar-w360dp-h800dp-xhdpi")
    fun firstSetupArabicScreenshot() = capture("setup-prepare-ar-font130", 1.3f, step = 0)

    private fun capture(name: String, fontScale: Float, step: Int? = null) {
        RuntimeEnvironment.setFontScale(fontScale)
        val (_, _, root) = screen(step)
        Files.createDirectories(Paths.get("build/reports/remote-host-ui"))
        Files.writeString(Paths.get("build/reports/remote-host-ui/$name-layout.txt"), descendants(root).joinToString("\n") {
            "${it.javaClass.simpleName} ${it.left},${it.top},${it.right},${it.bottom} rtl=${it.layoutDirection} " +
                if (it is TextView) "text=${it.text} align=${it.textAlignment} direction=${it.textDirection} size=${it.textSize} layout=${it.layout?.width} lines=${it.layout?.lineCount} first=${it.layout?.getLineLeft(0)},${it.layout?.getLineRight(0)} measured=${it.paint.measureText(it.text.toString())} scrollX=${it.scrollX}" else ""
        })
        for (view in descendants(root).filterIsInstance<TextView>()) {
            if (view.visibility != View.VISIBLE) continue
            val layout = view.layout ?: continue
            assertTrue("Horizontally scrolling text: ${view.text}", layout.width <= view.width)
            for (line in 0 until layout.lineCount) {
                assertEquals("Truncated: ${view.text}", 0, layout.getEllipsisCount(line))
                assertTrue("Outside text bounds: ${view.text}, left=${layout.getLineLeft(line)}, right=${layout.getLineRight(line)}, width=${layout.width}",
                    layout.getLineLeft(line) >= -1 && layout.getLineRight(line) <= layout.width + 1)
            }
        }
        writeScreenshot(root, name)
    }

    private fun writeScreenshot(root: View, name: String) {
        // Capture a settled interface rather than a Material button's initial state animation.
        for (view in descendants(root)) {
            view.jumpDrawablesToCurrentState()
            view.stateListAnimator?.jumpToCurrentState()
        }
        val bitmap = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
        try {
            root.draw(Canvas(bitmap))
            val path = Paths.get("build/reports/remote-host-ui/$name.png")
            Files.createDirectories(path.parent)
            Files.newOutputStream(path).use { assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        } finally { bitmap.recycle() }
    }

    private data class Screen(val activity: Activity, val ui: RemoteHostUi, val root: View)
    private fun screen(step: Int? = null): Screen {
        controller = Robolectric.buildActivity(Activity::class.java).setup()
        val activity = controller!!.get()
        activity.applicationInfo.targetSdkVersion = 29
        activity.applicationInfo.flags = activity.applicationInfo.flags or android.content.pm.ApplicationInfo.FLAG_SUPPORTS_RTL
        val actions = RemoteHostUi.Actions(
            settings = {}, connection = {}, displayAudio = {}, permissions = {}, choosePhone = {}, phoneMenu = {},
            wireless = { wirelessStarts++ }, usb = {}, next = { nextSteps++ }, back = {},
            finish = { completed++ }, skip = {}, refresh = {}, autoConnect = { false }, saveAutoConnect = {},
        )
        val ui = RemoteHostUi(activity, output, true, { "iPhone 17 Pro Max" }, { false }, { null }, actions)
        val scroll = ScrollView(activity).apply {
            layoutDirection = resources.configuration.layoutDirection
            isVerticalScrollBarEnabled = false
            setBackgroundColor(DiPlayPalette.DARK.background)
            val edge = (RemoteHostUi.PAGE_EDGE_DP * resources.displayMetrics.density).toInt()
            setPadding(edge, edge, edge, edge)
            val body = if (step == null) ui.home() else ui.setup(step)
            val width = minOf(RemoteHostUi.MAX_WIDTH_DP,
                resources.configuration.screenWidthDp - 2 * RemoteHostUi.PAGE_EDGE_DP)
            addView(body, FrameLayout.LayoutParams((width * resources.displayMetrics.density).toInt(), -2,
                android.view.Gravity.CENTER_HORIZONTAL))
        }
        activity.setContentView(scroll)
        layout(scroll)
        return Screen(activity, ui, scroll)
    }

    private fun layout(root: View) {
        val metrics = root.resources.displayMetrics
        root.measure(View.MeasureSpec.makeMeasureSpec(metrics.widthPixels, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(metrics.heightPixels, View.MeasureSpec.EXACTLY))
        root.layout(0, 0, root.measuredWidth, root.measuredHeight)
    }

    private fun button(root: View, title: String) = descendants(root).filterIsInstance<Button>().single { it.text == title }
    private fun descendants(view: View): List<View> = listOf(view) +
        if (view is ViewGroup) (0 until view.childCount).flatMap { descendants(view.getChildAt(it)) } else emptyList()

    private class Output : CarPlayOutputExtension {
        override val remoteHostUi = true
        override val hostProductName = "DiPlay Tesla"
        var opened = 0
        var renewed = 0
        var snapshot = RemoteHostSnapshot("https://carplay.example", true, "482916", true, false)
        override fun hostSnapshot() = snapshot
        override fun openHostPairing(renew: Boolean) {
            opened++
            if (renew) { renewed++; snapshot = snapshot.copy(pairingCode = "975310") }
        }
        override fun configure(config: AirPlayConfig) = config
        override fun mediaSink(local: MediaSink) = local
        override fun attach(controller: CarPlayController, reconnect: () -> Unit) {}
        override fun detach(controller: CarPlayController?) {}
        override fun connectionSummary() = snapshot.address.orEmpty()
        override fun displaySummary() = ""
        override fun showConnectionSettings(activity: Activity, saved: () -> Unit) {}
        override fun showDisplaySettings(activity: Activity, saved: () -> Unit) {}
    }
}
