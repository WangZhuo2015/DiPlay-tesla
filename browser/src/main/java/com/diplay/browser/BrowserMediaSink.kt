package com.diplay.browser

import com.shilapi.xcertplay.airplay.MediaSink
import com.shilapi.xcertplay.airplay.VideoCodec

/** Local audio/microphone handling is delegated unchanged; only screen events are fanned out. */
class BrowserMediaSink(private val local: MediaSink, private val browser: MediaSink,
    pcm: com.shilapi.xcertplay.media.RemotePcmOutput? = null) : MediaSink by local {
    init { local.setPcmOutput(pcm) }
    override fun onVideoCodec(type: Int, codec: VideoCodec) {
        local.onVideoCodec(type, codec); browser.onVideoCodec(type, codec)
    }
    override fun onVideoConfig(type: Int, codecData: ByteArray) {
        local.onVideoConfig(type, codecData); browser.onVideoConfig(type, codecData)
    }
    override fun onVideoFrame(type: Int, naluBytes: ByteArray) {
        local.onVideoFrame(type, naluBytes); browser.onVideoFrame(type, naluBytes)
    }
    override fun onVideoFrame(type: Int, naluBytes: ByteArray, senderNanos: Long, arrivalNanos: Long) {
        local.onVideoFrame(type, naluBytes, senderNanos, arrivalNanos)
        browser.onVideoFrame(type, naluBytes, senderNanos, arrivalNanos)
    }
    override fun setVideoRecoveryHandler(type: Int, handler: () -> Unit) {
        local.setVideoRecoveryHandler(type, handler); browser.setVideoRecoveryHandler(type, handler)
    }
    override fun onScreenStreamActive(type: Int, active: Boolean) {
        local.onScreenStreamActive(type, active); browser.onScreenStreamActive(type, active)
    }
}
