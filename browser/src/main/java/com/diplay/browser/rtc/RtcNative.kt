package com.diplay.browser.rtc

import com.shilapi.xcertplay.airplay.VideoCodec

/** Confined to the media worker; callbacks only enqueue work. */
internal class RtcNative(private val event: (String, String) -> Unit, private val testPort: Int = 0,
    private val bindAddress: String? = null) : RtcPeer {
    private var handle = 0L
    private external fun create(codec: Int, profile: String, port: Int, bindAddress: String?): Long
    private external fun begin(handle: Long)
    private external fun answer(handle: Long, sdp: String)
    private external fun send(handle: Long, annexB: ByteArray, timestamp: Long): Boolean
    private external fun destroy(handle: Long)
    override fun start(profile: String) = start(VideoCodec.H264, profile)
    override fun start(codec: VideoCodec, profile: String) {
        event("binding", if (bindAddress == null) "any" else "explicit-ipv4")
        handle = create(if (codec == VideoCodec.H265) 265 else 264, profile, testPort, bindAddress)
        begin(handle)
    }
    override fun answer(sdp: String) { if (handle != 0L) answer(handle, sdp) }
    override fun send(frame: ByteArray, timestamp: Long) = handle != 0L && send(handle, frame, timestamp)
    override fun close() { if (handle != 0L) { destroy(handle); handle = 0L } }
    @Suppress("unused") private fun onEvent(kind: String, value: String) = event(kind, value)
    companion object { init { System.loadLibrary("diplay-rtc") } }
}

internal interface RtcPeer : java.io.Closeable {
    fun start(profile: String)
    fun start(codec: VideoCodec, profile: String) {
        require(codec == VideoCodec.H264) { "Peer does not support HEVC" }
        start(profile)
    }
    fun answer(sdp: String)
    fun send(frame: ByteArray, timestamp: Long): Boolean
}
