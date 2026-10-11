package com.diplay.browser

import com.shilapi.xcertplay.airplay.*
import com.shilapi.xcertplay.media.RemotePcmOutput
import org.junit.Assert.*
import org.junit.Test
import java.net.InetAddress

class BrowserMediaSinkTest {
    private class RecordingSink : MediaSink {
        val video = mutableListOf<String>()
        val active = mutableListOf<Boolean>()
        val audio = mutableListOf<String>()
        var pcm: RemotePcmOutput? = null
        var timedFrame: List<Long>? = null
        override fun setPcmOutput(output: RemotePcmOutput?) { pcm = output }
        override fun onVideoCodec(type: Int, codec: VideoCodec) { video += "codec" }
        override fun onVideoConfig(type: Int, codecData: ByteArray) { video += "config" }
        override fun onVideoFrame(type: Int, naluBytes: ByteArray) { video += "frame" }
        override fun onVideoFrame(type: Int, naluBytes: ByteArray, senderNanos: Long, arrivalNanos: Long) {
            video += "timed"; timedFrame = listOf(senderNanos, arrivalNanos)
        }
        override fun setVideoRecoveryHandler(type: Int, handler: () -> Unit) { video += "recovery" }
        override fun setVideoDiagnosticHandler(type: Int, handler: (String) -> Unit) { video += "diagnostic" }
        override fun onScreenStreamActive(type: Int, active: Boolean) { this.active += active }
        override fun onAudioStarted(id: AudioStreamId, format: AudioFormat, firstSample: Int) { audio += "start" }
        override fun onAudioRtp(id: AudioStreamId, format: AudioFormat, rtp: ByteArray, sample: Int) { audio += "packet" }
        override fun onAudioStopped(id: AudioStreamId) { audio += "stop" }
        override fun onMicrophoneStarted(id: AudioStreamId, config: MicrophoneConfig) { audio += "mic-start" }
        override fun onMicrophoneStopped(id: AudioStreamId) { audio += "mic-stop" }
        override fun onIapMessage(bytes: ByteArray) { audio += "iap" }
    }

    @Test fun onlyBrowserReceivesVideoWhileLocalConnectionStateIsKept() {
        val local = RecordingSink(); val browser = RecordingSink()
        val sink = BrowserMediaSink(local, browser)
        sink.setVideoRecoveryHandler(110) {}
        sink.setVideoDiagnosticHandler(110) {}
        sink.onScreenStreamActive(110, true)
        sink.onVideoCodec(110, VideoCodec.H264)
        sink.onVideoConfig(110, byteArrayOf(1))
        sink.onVideoFrame(110, byteArrayOf(2))
        sink.onVideoFrame(110, byteArrayOf(3), 10, 20)
        sink.onScreenStreamActive(110, false)
        assertTrue(local.video.isEmpty())
        assertEquals(listOf("recovery", "diagnostic", "codec", "config", "frame", "timed"), browser.video)
        assertEquals(listOf(10L, 20L), browser.timedFrame)
        assertEquals(listOf(true, false), local.active)
        assertEquals(local.active, browser.active)
    }

    @Test fun audioAndMicrophoneStillUseLocalSinkWithOptionalRemotePcm() {
        val local = RecordingSink(); val browser = RecordingSink()
        val pcm = object : RemotePcmOutput {
            override fun offer(id: AudioStreamId, format: AudioFormat, pcm: ByteArray, offset: Int, length: Int) = true
            override fun stopped(id: AudioStreamId) {}
        }
        val sink = BrowserMediaSink(local, browser, pcm)
        val id = AudioStreamId(100, "media")
        val format = AudioFormat(AudioCodecKind.LPCM, 48000, 2, 96)
        val mic = MicrophoneConfig("speech", 48000, 1, 96, 20, InetAddress.getLoopbackAddress(), 7000, ByteArray(32))
        sink.onAudioStarted(id, format, 0)
        sink.onAudioRtp(id, format, byteArrayOf(1), 1)
        sink.onAudioStopped(id)
        sink.onMicrophoneStarted(id, mic)
        sink.onMicrophoneStopped(id)
        sink.onIapMessage(byteArrayOf(2))
        assertSame(pcm, local.pcm)
        assertEquals(listOf("start", "packet", "stop", "mic-start", "mic-stop", "iap"), local.audio)
        assertTrue(browser.audio.isEmpty())
    }
}
