package com.diplay.browser

import android.graphics.BitmapFactory
import android.graphics.Color
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.nio.ByteBuffer

/** Runs a real Android encoder→browser decoder→JPEG path; no iPhone identity/fixture is needed. */
@RunWith(AndroidJUnit4::class)
class JpegVideoSinkInstrumentedTest {
    @Test fun realH264FrameBecomesBrowserJpeg() {
        val frames = LatestFrame()
        var decoderError: String? = null
        val sink = JpegVideoSink(BrowserDisplay(right = BrowserResolution(320,240),fps = 10),frames) { decoderError = it }
        val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        try {
            val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC,320,240).apply {
                setInteger(MediaFormat.KEY_COLOR_FORMAT,MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
                setInteger(MediaFormat.KEY_BIT_RATE,250_000)
                setInteger(MediaFormat.KEY_FRAME_RATE,10)
                setInteger(MediaFormat.KEY_I_FRAME_INTERVAL,1)
            }
            encoder.configure(format,null,null,MediaCodec.CONFIGURE_FLAG_ENCODE)
            encoder.start()
            val info = MediaCodec.BufferInfo()
            var count = 0
            val deadline = System.nanoTime()+20_000_000_000L
            while (frames.after(0) == null && System.nanoTime() < deadline) {
                frames.request()
                if (count < 40) {
                    val input = encoder.dequeueInputBuffer(10_000)
                    if (input >= 0) {
                        val image = encoder.getInputImage(input) ?: error("Encoder does not expose input image")
                        try {
                            image.planes.forEachIndexed { planeIndex, plane ->
                                val width = if (planeIndex == 0) 320 else 160
                                val height = if (planeIndex == 0) 240 else 120
                                val value = when (planeIndex) { 0 -> 76; 1 -> 85; else -> 255 }.toByte()
                                val base = plane.buffer.position()
                                repeat(height) { row -> repeat(width) { column ->
                                    plane.buffer.put(base + row*plane.rowStride + column*plane.pixelStride,value)
                                } }
                            }
                        } finally { image.close() }
                        encoder.queueInputBuffer(input,0,320*240*3/2,count++*100_000L,0)
                    }
                }
                when (val output = encoder.dequeueOutputBuffer(info,10_000)) {
                    MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                        val actual = encoder.outputFormat
                        val sps = bytes(actual.getByteBuffer("csd-0")!!).let(::rawNal)
                        val pps = bytes(actual.getByteBuffer("csd-1")!!).let(::rawNal)
                        val config = byteArrayOf(1,sps[1],sps[2],sps[3],-1,-31,
                            (sps.size shr 8).toByte(),sps.size.toByte()) + sps +
                            byteArrayOf(1,(pps.size shr 8).toByte(),pps.size.toByte()) + pps
                        sink.onVideoConfig(110,config)
                    }
                    else -> if (output >= 0) {
                        try {
                            if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0 && info.size > 0) {
                                val buffer = encoder.getOutputBuffer(output)!!.duplicate()
                                buffer.position(info.offset); buffer.limit(info.offset+info.size)
                                sink.onVideoFrame(110,bytes(buffer))
                            }
                        } finally { encoder.releaseOutputBuffer(output,false) }
                    }
                }
                Thread.sleep(10)
            }
            val jpeg = frames.after(0)?.jpeg
            assertNotNull("No JPEG produced; decoder error=$decoderError",jpeg)
            val bitmap = BitmapFactory.decodeByteArray(jpeg,0,jpeg!!.size)
            assertEquals(320,bitmap.width)
            assertEquals(240,bitmap.height)
            val pixel = bitmap.getPixel(160,120)
            assertTrue("Chroma conversion should retain the red input",Color.red(pixel) > Color.green(pixel)+80)
            bitmap.recycle()
        } finally { sink.close(); encoder.release() }
    }
    private fun bytes(buffer: ByteBuffer): ByteArray = ByteArray(buffer.remaining()).also { buffer.duplicate().get(it) }
    private fun rawNal(bytes: ByteArray): ByteArray = when {
        bytes.take(4) == listOf<Byte>(0,0,0,1) -> bytes.copyOfRange(4,bytes.size)
        bytes.take(3) == listOf<Byte>(0,0,1) -> bytes.copyOfRange(3,bytes.size)
        else -> bytes
    }
}
