package com.shilapi.xcertplay

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.widget.TextViewCompat
import com.shilapi.xcertplay.host.R

/** Product UI for a remote display host. The connection engine and other head-unit homes are unchanged. */
internal class RemoteHostUi(
    private val activity: Activity,
    private val output: CarPlayOutputExtension,
    private val night: Boolean,
    private val phoneName: () -> String?,
    private val running: () -> Boolean,
    private val connectionError: () -> String?,
    private val actions: Actions,
) {
    data class Actions(
        val settings: () -> Unit,
        val connection: () -> Unit,
        val displayAudio: () -> Unit,
        val permissions: () -> Unit,
        val choosePhone: () -> Unit,
        val phoneMenu: () -> Unit,
        val wireless: () -> Unit,
        val usb: () -> Unit,
        val next: () -> Unit,
        val back: () -> Unit,
        val finish: () -> Unit,
        val skip: () -> Unit,
        val refresh: () -> Unit,
        val autoConnect: () -> Boolean,
        val saveAutoConnect: (Boolean) -> Unit,
    )

    private val palette = DiPlayPalette.of(night)
    private var address: TextView? = null
    private var entryKind: TextView? = null
    private var code: TextView? = null
    private var expiry: TextView? = null
    private var phone: TextView? = null
    private var phoneCard: View? = null
    private var phoneStatus: TextView? = null
    private var browserStatus: TextView? = null
    private var copy: Button? = null
    private var renew: Button? = null
    private var error: TextView? = null
    private var connect: Button? = null

    fun home(): View = column().apply {
        output.openHostPairing()
        addView(masthead())
        gap(this, BLOCK_GAP_DP)
        addView(phoneSummary())
        gap(this, HERO_GAP_DP)
        addView(text(R.string.settings_host_connect_browser, TITLE_SP, true))
        gap(this, INLINE_GAP_DP)
        addView(text(R.string.settings_host_open_browser, BODY_SP, color = palette.secondaryText))
        gap(this, BLOCK_GAP_DP)
        addView(pairing())
        gap(this, BLOCK_GAP_DP)
        addView(browserSummary())
        gap(this, BLOCK_GAP_DP)
        addView(actionRow(R.drawable.ic_dp_controls, R.string.connection_setup, actions.connection))
        addView(actionRow(R.drawable.ic_dp_display, R.string.settings_host_display_audio, actions.displayAudio))
        refresh()
    }

    /** Four host/browser tasks replace the vehicle-generation wizard for remote-display products. */
    fun setup(step: Int): View = column().apply {
        addView(masthead())
        gap(this, BLOCK_GAP_DP)
        addView(text(activity.getString(R.string.setup_step_of, step + 1, SETUP_STEPS), CAPTION_SP,
            color = palette.accent))
        gap(this, INLINE_GAP_DP)
        val titles = intArrayOf(R.string.settings_host_prepare, R.string.settings_host_setup_iphone,
            R.string.settings_host_setup_entry, R.string.settings_host_connect_browser)
        val hints = intArrayOf(R.string.settings_host_prepare_hint, R.string.settings_host_iphone_hint,
            R.string.settings_host_gateway_hint, R.string.settings_host_open_browser)
        addView(text(titles[step], TITLE_SP, true))
        gap(this, INLINE_GAP_DP)
        addView(text(hints[step], BODY_SP, color = palette.secondaryText))
        gap(this, BLOCK_GAP_DP)
        when (step) {
            0 -> {
                addView(actionRow(R.drawable.ic_dp_permissions, R.string.review_app_permissions, actions.permissions))
                addView(actionRow(R.drawable.ic_dp_connection, R.string.connection_setup, actions.connection))
                val toggle = android.widget.Switch(activity).apply {
                    text = activity.getString(R.string.connect_when_diplay_opens)
                    textSize = BODY_SP.toFloat(); setTextColor(palette.primaryText)
                    minHeight = dp(CONTROL_DP)
                    isChecked = actions.autoConnect()
                    setOnCheckedChangeListener { _, checked -> actions.saveAutoConnect(checked) }
                }
                addView(toggle, LinearLayout.LayoutParams(-1, -2))
            }
            1 -> {
                addView(phoneSummary(showConnect = false))
                gap(this, BLOCK_GAP_DP)
                addView(actionRow(R.drawable.ic_dp_connection, R.string.choose_iphone, actions.choosePhone))
                addView(button(R.string.connect_phone, true, actions.wireless))
                gap(this, INLINE_GAP_DP)
                addView(button(R.string.connect_with_usb, false, actions.usb))
            }
            2 -> {
                addView(entry())
                gap(this, BLOCK_GAP_DP)
                addView(button(R.string.settings_host_entry, true) {
                    output.showEntrySettings(activity, actions.refresh)
                })
            }
            else -> {
                output.openHostPairing()
                addView(pairing())
                gap(this, BLOCK_GAP_DP)
                addView(browserSummary())
            }
        }
        gap(this, HERO_GAP_DP)
        val footer = row()
        footer.addView(button(R.string.back, false, actions.back), weightedControl())
        footer.addView(button(if (step == SETUP_STEPS - 1) R.string.done else R.string.setup_next,
            true, if (step == SETUP_STEPS - 1) actions.finish else actions.next), weightedControl().apply {
            marginStart = dp(INLINE_GAP_DP)
        })
        addView(footer)
        gap(this, INLINE_GAP_DP)
        addView(button(R.string.setup_skip, false, actions.skip))
        refresh()
    }

    fun refresh() {
        val state = output.hostSnapshot() ?: return
        phone?.text = phoneName() ?: activity.getString(R.string.choose_iphone)
        phoneStatus?.apply {
            text = activity.getString(when {
                state.iphoneConnected -> R.string.settings_host_connected
                running() -> R.string.connecting_to_your_iphone
                else -> R.string.settings_host_phone_waiting
            })
            setTextColor(if (state.iphoneConnected) palette.success else palette.secondaryText)
        }
        phoneCard?.contentDescription = "${phone?.text} · ${phoneStatus?.text} · ${activity.getString(R.string.choose_iphone)}"
        browserStatus?.apply {
            text = activity.getString(if (state.browserConnected) R.string.settings_host_browser_connected
                else R.string.settings_host_browser_waiting)
            setTextColor(if (state.browserConnected) palette.success else palette.warning)
        }
        connect?.visibility = if (state.iphoneConnected) View.GONE else View.VISIBLE
        connect?.isEnabled = connectionError() == null && !running()
        address?.text = state.address ?: activity.getString(R.string.settings_host_entry_pending)
        entryKind?.text = activity.getString(if (state.httpsEntryConfigured)
            R.string.settings_host_https_configured else R.string.settings_host_direct)
        code?.text = state.pairingCode?.let { it.take(CODE_GROUP) + " " + it.drop(CODE_GROUP) } ?: "— —"
        expiry?.text = activity.getString(if (state.pairingCode == null) R.string.settings_host_code_expired
            else R.string.settings_host_code_expiry)
        renew?.visibility = if (state.pairingCode == null) View.VISIBLE else View.GONE
        copy?.isEnabled = state.address != null
        val message = connectionError() ?: state.error
        error?.text = message
        error?.visibility = if (message == null) View.GONE else View.VISIBLE
    }

    private fun masthead() = row().apply {
        gravity = Gravity.CENTER_VERTICAL
        addView(text(output.hostProductName ?: activity.applicationInfo.loadLabel(activity.packageManager).toString(), BRAND_SP, true),
            LinearLayout.LayoutParams(0, -2, 1f))
        addView(android.widget.ImageButton(activity).apply {
            setImageResource(R.drawable.ic_host_settings); setColorFilter(palette.accent)
            contentDescription = activity.getString(R.string.settings_host_settings)
            background = shape(palette.surface)
            setPadding(dp(ICON_INSET_DP), dp(ICON_INSET_DP), dp(ICON_INSET_DP), dp(ICON_INSET_DP))
            setOnClickListener { actions.settings() }
        }, LinearLayout.LayoutParams(dp(CONTROL_DP), dp(CONTROL_DP)))
    }

    private fun phoneSummary(showConnect: Boolean = true) = surface().apply {
        phoneCard = this
        isClickable = true; isFocusable = true
        contentDescription = activity.getString(R.string.choose_iphone)
        setOnClickListener { actions.phoneMenu() }
        val body = row().apply { gravity = Gravity.CENTER_VERTICAL }
        body.addView(icon(R.drawable.ic_host_phone), LinearLayout.LayoutParams(dp(ICON_DP), dp(ICON_DP)))
        body.addView(column().apply {
            phone = text("", BODY_SP, true).also { addView(it) }
            phoneStatus = text("", CAPTION_SP).also { addView(it) }
        }, LinearLayout.LayoutParams(0, -2, 1f).apply { marginStart = dp(BLOCK_GAP_DP) })
        body.addView(chevron(), LinearLayout.LayoutParams(dp(CHEVRON_DP), dp(CHEVRON_DP)).apply {
            marginStart = dp(INLINE_GAP_DP)
        })
        addView(body)
        error = text("", CAPTION_SP, color = palette.warning).also { addView(it) }
        if (showConnect) connect = button(R.string.connect_phone, false, actions.wireless).also { addView(it) }
    }

    private fun browserSummary() = surface().apply {
        val line = row().apply { gravity = Gravity.CENTER_VERTICAL }
        line.addView(icon(R.drawable.ic_host_browser), LinearLayout.LayoutParams(dp(ICON_DP), dp(ICON_DP)))
        line.addView(column().apply {
            addView(text(R.string.settings_host_browser_name, BODY_SP, true))
            browserStatus = text("", CAPTION_SP).also { addView(it) }
        }, LinearLayout.LayoutParams(0, -2, 1f).apply { marginStart = dp(BLOCK_GAP_DP) })
        addView(line)
    }

    private fun entry() = column().apply {
        val addressRow = surface()
        val line = row().apply { gravity = Gravity.CENTER_VERTICAL }
        line.addView(icon(R.drawable.ic_host_link), LinearLayout.LayoutParams(dp(ICON_DP), dp(ICON_DP)))
        address = text("", BODY_SP, true, palette.accent).apply {
            textDirection = View.TEXT_DIRECTION_LTR; setTextIsSelectable(true)
        }.also { line.addView(it, LinearLayout.LayoutParams(0, -2, 1f).apply { marginStart = dp(BLOCK_GAP_DP) }) }
        addressRow.addView(line)
        addView(addressRow)
        gap(this, INLINE_GAP_DP)
        entryKind = text("", CAPTION_SP, color = palette.secondaryText).also { addView(it) }
    }

    private fun pairing() = column().apply {
        addView(entry())
        gap(this, BLOCK_GAP_DP)
        addView(divider())
        gap(this, BLOCK_GAP_DP)
        addView(text(R.string.settings_browser_pairing_code, BODY_SP, color = palette.secondaryText))
        code = text("", CODE_MAX_SP, true, palette.accent).apply {
            textDirection = View.TEXT_DIRECTION_LTR
            maxLines = 1
            setHorizontallyScrolling(false)
            gravity = Gravity.CENTER
            textAlignment = View.TEXT_ALIGNMENT_CENTER
            typeface = Typeface.create("sans-serif", Typeface.BOLD)
            TextViewCompat.setAutoSizeTextTypeUniformWithConfiguration(this, CODE_MIN_SP, CODE_MAX_SP,
                CODE_SIZE_STEP_SP, android.util.TypedValue.COMPLEX_UNIT_SP)
        }.also { addView(it, LinearLayout.LayoutParams(-1, dp(CODE_HEIGHT_DP))) }
        expiry = text("", CAPTION_SP, color = palette.secondaryText).also { addView(it) }
        gap(this, BLOCK_GAP_DP)
        copy = button(R.string.settings_host_copy_address, true) {
            output.hostSnapshot()?.address?.let { value ->
                activity.getSystemService(ClipboardManager::class.java)
                    .setPrimaryClip(ClipData.newPlainText("DiPlay", value))
                Toast.makeText(activity, R.string.settings_host_copied, Toast.LENGTH_SHORT).show()
            }
        }.also { addView(it) }
        renew = button(R.string.settings_host_code_renew, false) {
            output.openHostPairing(renew = true); refresh()
        }.also { addView(it) }
    }

    private fun actionRow(drawable: Int, title: Int, action: () -> Unit): View = column().apply {
        addView(divider())
        val line = row().apply {
            gravity = Gravity.CENTER_VERTICAL; minimumHeight = dp(ROW_DP)
            isClickable = true; isFocusable = true
            contentDescription = activity.getString(title)
            setOnClickListener { action() }
        }
        line.addView(icon(drawable), LinearLayout.LayoutParams(dp(ROW_ICON_DP), dp(ROW_ICON_DP)))
        line.addView(text(title, BODY_SP, true), LinearLayout.LayoutParams(0, -2, 1f).apply {
            marginStart = dp(BLOCK_GAP_DP); marginEnd = dp(INLINE_GAP_DP)
        })
        line.addView(chevron(), LinearLayout.LayoutParams(dp(CHEVRON_DP), dp(CHEVRON_DP)))
        addView(line)
    }

    private fun icon(resource: Int) = ImageView(activity).apply {
        setImageResource(resource); setColorFilter(palette.accent)
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    private fun chevron() = icon(R.drawable.ic_dp_chevron).apply {
        if (activity.resources.configuration.layoutDirection == View.LAYOUT_DIRECTION_RTL) scaleX = -1f
    }
    private fun surface() = column().apply {
        background = shape(palette.surface)
        setPadding(dp(SURFACE_INSET_DP), dp(SURFACE_INSET_DP), dp(SURFACE_INSET_DP), dp(SURFACE_INSET_DP))
    }
    private fun shape(color: Int) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(CONTROL_DP) * CONTROL_RADIUS_RATIO
        setStroke(dp(OUTLINE_DP), palette.outline)
    }
    private fun button(title: Int, primary: Boolean, click: () -> Unit) = Button(activity).apply {
        text = activity.getString(title); textSize = BODY_SP.toFloat(); isAllCaps = false
        typeface = Typeface.create("sans-serif", Typeface.BOLD)
        setTextColor(if (primary) palette.onAccent else palette.accent)
        background = shape(if (primary) palette.accent else palette.background)
        minHeight = dp(CONTROL_DP); minimumHeight = dp(CONTROL_DP)
        setPadding(dp(BLOCK_GAP_DP), dp(INLINE_GAP_DP), dp(BLOCK_GAP_DP), dp(INLINE_GAP_DP))
        layoutParams = LinearLayout.LayoutParams(-1, -2)
        setOnClickListener { click() }
    }
    private fun text(resource: Int, size: Int, bold: Boolean = false, color: Int = palette.primaryText) =
        text(activity.getString(resource), size, bold, color)
    private fun text(value: String, size: Int, bold: Boolean = false, color: Int = palette.primaryText) =
        TextView(activity).apply {
            text = value; textSize = size.toFloat(); setTextColor(color)
            gravity = Gravity.START
            textAlignment = View.TEXT_ALIGNMENT_GRAVITY
            textDirection = View.TEXT_DIRECTION_LOCALE
            if (bold) typeface = Typeface.create("sans-serif", Typeface.BOLD)
            setLineSpacing(0f, LINE_HEIGHT_RATIO)
        }
    private fun divider() = View(activity).apply {
        setBackgroundColor(palette.outline); layoutParams = LinearLayout.LayoutParams(-1, dp(OUTLINE_DP))
    }
    private fun column() = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL; layoutDirection = resources.configuration.layoutDirection
    }
    private fun row() = LinearLayout(activity).apply {
        orientation = LinearLayout.HORIZONTAL; layoutDirection = resources.configuration.layoutDirection
    }
    private fun gap(parent: LinearLayout, value: Int) = parent.addView(View(activity), LinearLayout.LayoutParams(1, dp(value)))
    private fun weightedControl() = LinearLayout.LayoutParams(0, -2, 1f)
    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()

    companion object {
        const val SETUP_STEPS = 4
        const val PAGE_EDGE_DP = 18
        const val MAX_WIDTH_DP = 720
        private const val INLINE_GAP_DP = 8
        private const val BLOCK_GAP_DP = 16
        private const val HERO_GAP_DP = 28
        private const val SURFACE_INSET_DP = 14
        private const val CONTROL_DP = 56
        private const val ROW_DP = 64
        private const val ICON_DP = 32
        private const val ICON_INSET_DP = 14
        private const val ROW_ICON_DP = 24
        private const val CHEVRON_DP = 20
        private const val OUTLINE_DP = 1
        private const val CODE_HEIGHT_DP = 86
        private const val CODE_MIN_SP = 32
        private const val CODE_MAX_SP = 66
        private const val CODE_SIZE_STEP_SP = 1
        private const val CODE_GROUP = 3
        private const val TITLE_SP = 30
        private const val BRAND_SP = 27
        private const val BODY_SP = 16
        private const val CAPTION_SP = 14
        private const val LINE_HEIGHT_RATIO = 1.12f
        private const val CONTROL_RADIUS_RATIO = .22f
    }
}
