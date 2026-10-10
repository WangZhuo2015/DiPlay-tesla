package com.diplay.tesla

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.text.BidiFormatter
import android.text.InputType
import android.text.TextDirectionHeuristics
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.ArrayAdapter
import android.widget.TextView
import com.diplay.browser.*
import com.diplay.browser.rtc.BrowserVideoOutput
import com.shilapi.xcertplay.AppLocale
import com.shilapi.xcertplay.CarPlayOutput
import com.shilapi.xcertplay.CarPlayOutputExtension
import com.shilapi.xcertplay.airplay.AirPlayConfig
import com.shilapi.xcertplay.airplay.AirPlayContact
import com.shilapi.xcertplay.airplay.AirPlayDisplayConfig
import com.shilapi.xcertplay.airplay.AirPlayKnobState
import com.shilapi.xcertplay.airplay.CarPlayMediaButton
import com.shilapi.xcertplay.airplay.MediaSink
import com.shilapi.xcertplay.host.R
import com.shilapi.xcertplay.orchestration.CarPlayController
import org.json.JSONObject
import java.net.Inet4Address
import java.net.NetworkInterface
import java.security.SecureRandom
import java.util.Collections

/** Application composition root. Core, browser transport, and the optional proxy have no cycles. */
class TeslaBrowserOutput(private val context: Context) : CarPlayOutputExtension, BrowserTarget {
    override val fixedDisplay = true
    override val updateReleasesUrl = "https://api.github.com/repos/WangZhuo2015/DiPlay-tesla/releases?per_page=3"
    override val updateApkPrefix = "DiPlay-Tesla-"
    private val prefs = context.getSharedPreferences("tesla-browser", Context.MODE_PRIVATE)
    private val frames = LatestFrame()
    private val media = BrowserMediaHub()
    private val handler = Handler(Looper.getMainLooper())
    private val token = prefs.getString("token", null) ?: ByteArray(16).also { SecureRandom().nextBytes(it) }
        .joinToString("") { "%02x".format(it.toInt() and 255) }.also { prefs.edit().putString("token", it).apply() }
    @Volatile private var display = runCatching {
        BrowserDisplayJson.decode(JSONObject(prefs.getString("display", "")!!))
    }.getOrDefault(BrowserDisplay())
    @Volatile private var negotiated: BrowserDisplay? = null
    @Volatile private var controller: CarPlayController? = null
    @Volatile private var reconnect: (() -> Unit)? = null
    @Volatile private var error: String? = null
    @Volatile private var serverError: String? = null
    @Volatile private var stage: String = context.getString(R.string.settings_browser_waiting)
    private var decoder: BrowserVideoOutput? = null
    private var server: BrowserServer? = null

    fun start() {
        Thread({
            try {
                val next = BrowserServer(PORT, context.assets, token, frames, this, media)
                try { next.start(5000, true); server = next }
                catch (failure: Exception) { next.close(); throw failure }
            } catch (failure: Exception) { serverError = "${failure.javaClass.simpleName}: ${failure.message}" }
        }, "tesla-browser-start").apply { isDaemon = true; start() }
    }
    override fun configure(config: AirPlayConfig): AirPlayConfig {
        val selected = display
        negotiated = selected
        val size = selected.resolution
        // Advertise the remote canvas, without handset insets, rotating areas, HEVC or BYD cluster.
        return config.copy(deviceName = "DiPlay Tesla", model = "Tesla Browser", hevc = false, cluster = null,
            main = AirPlayDisplayConfig(size.width, size.height,
                widthPhysicalMm = 220, heightPhysicalMm = (220.0 * size.height / size.width).toInt(), fps = selected.fps))
    }
    override fun mediaSink(local: MediaSink): MediaSink {
        decoder?.close()
        val output = BrowserVideoOutput(negotiated ?: display, frames) { error = it }
        decoder = output
        media.video(output)
        return BrowserMediaSink(local, output, media.audio)
    }
    override fun attach(controller: CarPlayController, reconnect: () -> Unit) {
        this.controller = controller
        this.reconnect = reconnect
    }
    override fun detach(controller: CarPlayController?) {
        if (this.controller !== controller) return
        server?.releaseInput()
        this.controller = null
        reconnect = null
        decoder?.close()
        decoder = null
        media.video(null)
        negotiated = null
        frames.clear()
        stage = context.getString(R.string.settings_browser_waiting)
    }
    override fun connectionStage(message: String) { stage = message }
    override fun touch(contacts: List<AirPlayContact>): Boolean = controller?.sendTouch(contacts) == true
    override fun action(name: String): Boolean {
        val current = controller ?: return false
        return when (name) {
            "home" -> current.sendKnob(AirPlayKnobState(home = true))
            "back" -> current.sendKnob(AirPlayKnobState(back = true))
            "siri" -> current.requestSiri()
            "play" -> current.sendMediaButton(CarPlayMediaButton.PLAY_PAUSE)
            "next" -> current.sendMediaButton(CarPlayMediaButton.NEXT)
            "previous" -> current.sendMediaButton(CarPlayMediaButton.PREVIOUS)
            "reconnect" -> reconnect?.let { handler.post { it() }; true } ?: false
            else -> false
        }
    }
    @Synchronized override fun saveDisplay(display: BrowserDisplay) {
        if (this.display == display) return // Returning to the same settings must not prompt a reconnect.
        prefs.edit().putString("display", BrowserDisplayJson.encode(display).toString()).apply()
        this.display = display
        handler.post { CarPlayOutput.markReconnectNeeded() }
    }
    override fun status(): JSONObject = JSONObject()
        .put("connected", controller?.activeAirPlaySessionToken() != null)
        .put("stage", stage).put("error", serverError ?: error ?: JSONObject.NULL)
        .put("display", BrowserDisplayJson.encode(display))
        .put("activeDisplay", negotiated?.let(BrowserDisplayJson::encode) ?: JSONObject.NULL)
        .put("pendingReconnect", negotiated != null && negotiated != display)
        .put("audio", if (media.audio.active) "browser" else "android")
        .put("transport", media.transport)

    override fun connectionSummary(): String = serverError ?: addresses().firstOrNull()?.let { "http://$it:$PORT" }
        ?: context.getString(R.string.settings_browser_waiting)
    override fun displaySummary(): String {
        val localized = AppLocale.wrap(context)
        val dimensions = BidiFormatter.getInstance(localized.resources.configuration.locales[0])
            .unicodeWrap("${display.resolution} · ${display.fps} fps", TextDirectionHeuristics.LTR)
        return "${modeLabel(localized, display.mode)} · $dimensions"
    }
    override fun showConnectionSettings(activity: Activity, saved: () -> Unit) {
        val links = addresses().map { "http://$it:$PORT" }
        val link = links.firstOrNull()?.let { "$it/#token=$token" }.orEmpty()
        val info = TextView(activity).apply {
            text = activity.getString(R.string.settings_browser_pairing_hint) + "\n\n" +
                links.joinToString("\n") + "\n\n" + activity.getString(R.string.settings_browser_pairing_code) + ":\n" + token +
                (serverError?.let { "\n\n$it" } ?: "")
            setTextIsSelectable(true)
            setPadding(dp(activity, PANEL_PADDING_DP), dp(activity, PANEL_PADDING_DP), dp(activity, PANEL_PADDING_DP), 0)
        }
        AlertDialog.Builder(activity).setTitle(R.string.settings_browser_connection)
            .setView(ScrollView(activity).apply { addView(info) })
            .setPositiveButton(android.R.string.ok) { _, _ -> saved() }
            .setNeutralButton(R.string.settings_browser_copy_link) { _, _ ->
                activity.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("DiPlay Tesla", link))
            }.show()
    }
    override fun showDisplaySettings(activity: Activity, saved: () -> Unit) {
        val baseline = display
        val form = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            val padding = dp(activity, PANEL_PADDING_DP)
            setPadding(padding, padding, padding, padding)
        }
        fun label(text: String) { form.addView(TextView(activity).apply { this.text = text }) }
        label(activity.getString(R.string.settings_browser_display_hint))
        val mode = Spinner(activity).apply {
            adapter = ArrayAdapter(activity, android.R.layout.simple_spinner_dropdown_item,
                BrowserMode.entries.map { modeLabel(activity, it) })
            setSelection(baseline.mode.ordinal)
        }
        form.addView(mode)
        fun field(title: String, value: Int): EditText {
            label(title)
            return EditText(activity).apply {
                inputType = InputType.TYPE_CLASS_NUMBER
                setText(value.toString())
                minimumHeight = dp(activity, CONTROL_HEIGHT_DP)
                form.addView(this)
            }
        }
        val rightWidth = field(activity.getString(R.string.settings_browser_right_width), baseline.right.width)
        val rightHeight = field(activity.getString(R.string.settings_browser_right_height), baseline.right.height)
        val fullWidth = field(activity.getString(R.string.settings_browser_full_width), baseline.full.width)
        val fullHeight = field(activity.getString(R.string.settings_browser_full_height), baseline.full.height)
        val fps = field(activity.getString(R.string.settings_browser_fps), baseline.fps)
        val quality = field(activity.getString(R.string.settings_browser_quality), baseline.jpegQuality)
        val dialog = AlertDialog.Builder(activity).setTitle(R.string.settings_browser_display)
            .setView(ScrollView(activity).apply { addView(form) })
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(R.string.save, null).create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val next = runCatching {
                    BrowserDisplay(BrowserMode.entries[mode.selectedItemPosition],
                        BrowserResolution(rightWidth.text.toString().toInt(), rightHeight.text.toString().toInt()),
                        BrowserResolution(fullWidth.text.toString().toInt(), fullHeight.text.toString().toInt()),
                        fps.text.toString().toInt(), quality.text.toString().toInt())
                }.getOrNull()
                if (next == null) { rightWidth.error = activity.getString(R.string.settings_browser_invalid); return@setOnClickListener }
                saveDisplay(next)
                dialog.dismiss()
                if (next != baseline) saved()
            }
        }
        dialog.show()
    }
    private fun addresses(): List<String> = runCatching {
        Collections.list(NetworkInterface.getNetworkInterfaces()).filter { it.isUp && !it.isLoopback }
            .flatMap { Collections.list(it.inetAddresses) }
            .filterIsInstance<Inet4Address>().filter { !it.isLoopbackAddress && it.isSiteLocalAddress }
            .mapNotNull { it.hostAddress }.distinct()
    }.getOrDefault(emptyList())
    private fun modeLabel(context: Context, mode: BrowserMode) = context.getString(
        if (mode == BrowserMode.RIGHT) R.string.settings_browser_right else R.string.settings_browser_full)
    private fun dp(context: Context, value: Int) = (context.resources.displayMetrics.density * value).toInt()
    companion object {
        const val PORT = 8080
        private const val PANEL_PADDING_DP = 24
        private const val CONTROL_HEIGHT_DP = 48
    }
}
