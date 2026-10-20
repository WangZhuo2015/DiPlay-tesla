package com.diplay.browser

import com.diplay.browser.rtc.BrowserVideoOutput
import com.diplay.browser.rtc.RtcRecoveryPolicy
import org.json.JSONObject

/** Composition seam for one authenticated media viewer; the core and proxy do not know it. */
class BrowserMediaHub {
    val audio = BrowserAudioOutput()
    private val lock = Any()
    private var owner: Any? = null
    private var send: ((JSONObject) -> Boolean)? = null
    private var rtc = false
    private var recoveryGraceMs = RtcRecoveryPolicy.BALANCED.graceMs
    @Volatile private var video: BrowserVideoOutput? = null
    val transport get() = video?.transport ?: "jpeg"
    fun video(output: BrowserVideoOutput?) = synchronized(lock) {
        video = output
        send?.let { output?.attach(rtc, recoveryGraceMs, it) }
    }
    fun attach(owner: Any, rtc: Boolean, send: (JSONObject) -> Boolean, audio: (ByteArray, Long) -> Boolean,
        recoveryGraceMs: Long = RtcRecoveryPolicy.BALANCED.graceMs): Boolean = synchronized(lock) {
        if (this.owner != null) return false
        this.owner = owner; this.send = send; this.rtc = rtc
        this.recoveryGraceMs = RtcRecoveryPolicy.fromMillis(recoveryGraceMs).graceMs
        this.audio.attach(owner, audio, send)
        video?.attach(rtc, this.recoveryGraceMs, send)
        true
    }
    fun command(owner: Any, data: JSONObject) = synchronized(lock) {
        if (this.owner !== owner) return
        when (data.getString("type")) {
            "audio-ready" -> audio.ready(owner, data.getBoolean("playback"))
            "rtc-answer", "rtc-ready", "rtc-feedback", "rtc-fallback" -> video?.command(data)
        }
    }
    fun detach(owner: Any) = synchronized(lock) {
        if (this.owner !== owner) return
        audio.detach(owner); video?.detach(); this.owner = null; send = null
    }
}
