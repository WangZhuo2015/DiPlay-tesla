package com.diplay.browser

import com.shilapi.xcertplay.airplay.MediaSink
import com.shilapi.xcertplay.airplay.VideoCodec

/** Tesla video goes only to the browser; Android retains audio, microphone and connection state. */
class BrowserMediaSink(private val local: MediaSink, private val browser: MediaSink,
    pcm: com.shilapi.xcertplay.media.RemotePcmOutput? = null) : MediaSink by local {
    init { local.setPcmOutput(pcm) }
    override fun onVideoCodec(type: Int, codec: VideoCodec) {
        browser.onVideoCodec(type, codec)
    }
    override fun onVideoConfig(type: Int, codecData: ByteArray) {
        browser.onVideoConfig(type, codecData)
    }
    override fun onVideoFrame(type: Int, naluBytes: ByteArray) {
        local.onVideoFrameObserved(type)
        browser.onVideoFrame(type, naluBytes)
    }
    override fun onVideoFrame(type: Int, naluBytes: ByteArray, senderNanos: Long, arrivalNanos: Long) {
        local.onVideoFrameObserved(type)
        browser.onVideoFrame(type, naluBytes, senderNanos, arrivalNanos)
    }
    override fun setVideoRecoveryHandler(type: Int, handler: () -> Unit) {
        browser.setVideoRecoveryHandler(type, handler)
    }
    override fun setVideoDiagnosticHandler(type: Int, handler: (String) -> Unit) {
        browser.setVideoDiagnosticHandler(type, handler)
    }
    override fun onScreenStreamActive(type: Int, active: Boolean) {
        local.onScreenStreamActive(type, active); browser.onScreenStreamActive(type, active)
    }
}
