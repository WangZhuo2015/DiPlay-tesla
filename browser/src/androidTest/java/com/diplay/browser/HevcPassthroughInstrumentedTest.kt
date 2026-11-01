package com.diplay.browser

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.diplay.browser.rtc.BrowserVideoOutput
import com.diplay.browser.rtc.RtcNative
import com.shilapi.xcertplay.airplay.AirPlayContact
import com.shilapi.xcertplay.airplay.MediaSink
import com.shilapi.xcertplay.airplay.VideoCodec
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/** PC-generated HEVC -> real Android native RTP/DTLS/SRTP -> external browser. No MediaCodec. */
@RunWith(AndroidJUnit4::class)
class HevcPassthroughInstrumentedTest {
    @Test fun externalBrowserReceivesHevcWithoutAnAndroidVideoCodec() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val assets = instrumentation.context.assets
        val samples = accessUnits(assets.open("hevc/red.h265").use { it.readBytes() })
        assertEquals(20, samples.size)
        val media = BrowserMediaHub()
        val finished = AtomicBoolean()
        val playbackConfirmed = AtomicBoolean()
        val index = AtomicInteger()
        val jpegCalls = AtomicInteger()
        val loopback = InstrumentationRegistry.getArguments().getString("loopbackIce") == "true"
        val bindAddress = InstrumentationRegistry.getArguments().getString("bindAddress")
        val display = BrowserDisplay(right = BrowserResolution(320, 240), fps = 10)
        val output = BrowserVideoOutput(object : MediaSink {
            override fun onVideoConfig(type: Int, codecData: ByteArray) { jpegCalls.incrementAndGet() }
            override fun onVideoFrame(type: Int, naluBytes: ByteArray) { jpegCalls.incrementAndGet() }
        }, {}) { callback -> RtcNative({ kind, value ->
            callback(kind, if (loopback && kind == "offer")
                value.replace("10.0.2.15", "127.0.0.1").replace("10.0.2.16", "127.0.0.1") else value)
        }, 40001, bindAddress) }
        media.video(output)
        val target = object : BrowserTarget {
            override fun status() = JSONObject().put("connected", true).put("stage", "Synthetic HEVC passthrough")
                .put("videoCodec", media.videoCodec).put("display", BrowserDisplayJson.encode(display))
                .put("activeDisplay", BrowserDisplayJson.encode(display)).put("pendingReconnect", false)
            override fun touch(contacts: List<AirPlayContact>) = true
            override fun action(name: String): Boolean {
                if (name == "home") {
                    playbackConfirmed.set(media.transport == "webrtc" && output.sentFrames >= 5)
                    finished.set(true)
                }
                return true
            }
            override fun saveDisplay(display: BrowserDisplay) {}
        }
        val server = BrowserServer(8098, instrumentation.targetContext.assets,
            "1234567890abcdef1234567890abcdef", LatestFrame(), target, media)
        try {
            output.setVideoRecoveryHandler(110) { index.set(0) }
            output.onVideoCodec(110, VideoCodec.H265)
            output.onVideoConfig(110, assets.open("hevc/red.hvcc").use { it.readBytes() })
            server.start(5000, true)
            val deadline = System.nanoTime() + 120_000_000_000L
            var sent = 0L
            while (!finished.get() && System.nanoTime() < deadline) {
                val frame = samples[Math.floorMod(index.getAndIncrement(), samples.size)]
                output.onVideoFrame(110, frame, sent++ * 100_000_000, System.nanoTime())
                Thread.sleep(100)
            }
            assertTrue("External browser did not confirm HEVC playback", finished.get())
            assertTrue("HEVC was not playing when the browser confirmed", playbackConfirmed.get())
            assertEquals("H265", media.videoCodec)
            assertEquals("HEVC must never reach the JPEG decoder", 0, jpegCalls.get())
        } finally { server.close(); output.close() }
    }

    private fun accessUnits(bytes: ByteArray): List<ByteArray> {
        val starts = mutableListOf<Int>()
        var cursor = 0
        while (cursor + 3 < bytes.size) {
            if (bytes[cursor] == 0.toByte() && bytes[cursor + 1] == 0.toByte() &&
                (bytes[cursor + 2] == 1.toByte() || bytes[cursor + 2] == 0.toByte() && bytes[cursor + 3] == 1.toByte())) {
                starts.add(cursor)
                cursor += if (bytes[cursor + 2] == 1.toByte()) 3 else 4
            } else cursor++
        }
        val units = mutableListOf<ByteArray>()
        var begin = 0
        var hasVideo = false
        starts.forEach { start ->
            val header = start + if (bytes[start + 2] == 1.toByte()) 3 else 4
            val type = bytes[header].toInt() ushr 1 and 63
            if (type == 35 && hasVideo) { units.add(bytes.copyOfRange(begin, start)); begin = start; hasVideo = false }
            if (type in 0..31) hasVideo = true
        }
        if (hasVideo) units.add(bytes.copyOfRange(begin, bytes.size))
        return units
    }
}
