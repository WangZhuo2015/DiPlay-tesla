package com.diplay.browser

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import com.shilapi.xcertplay.airplay.MediaSink
import com.shilapi.xcertplay.airplay.VideoCodec
import com.shilapi.xcertplay.media.MediaCodecSupport
import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.nio.ByteBuffer
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** A separate decoder/worker; browser backpressure never blocks the local audio or video sink. */
class JpegVideoSink(
    private val display: BrowserDisplay,
    private val frames: LatestFrame,
    private val report: (String?) -> Unit,
) : MediaSink, Closeable {
    private sealed class Job {
        data class Config(val bytes: ByteArray, val generation: Long) : Job()
        data class Frame(val bytes: ByteArray, val generation: Long) : Job()
        data object Reset : Job()
    }
    private val queue = ArrayBlockingQueue<Job>(12)
    private val lock = Any()
    @Volatile private var running = true
    @Volatile private var needsKeyFrame = true
    @Volatile private var generation = 0L
    @Volatile private var recovery: (() -> Unit)? = null
    @Volatile private var diagnostic: ((String) -> Unit)? = null
    private val rendered = AtomicBoolean()
    private var lastConfig: ByteArray? = null
    @Volatile private var suspended = false
    private val thread = Thread(::decode, "tesla-jpeg").apply { isDaemon = true; start() }

    override fun setVideoRecoveryHandler(type: Int, handler: () -> Unit) {
        if (type == MAIN_SCREEN) recovery = handler
    }
    override fun setVideoDiagnosticHandler(type: Int, handler: (String) -> Unit) {
        if (type == MAIN_SCREEN) { diagnostic = handler; rendered.set(false) }
    }
    override fun onVideoCodec(type: Int, codec: VideoCodec) {
        if (type == MAIN_SCREEN && codec != VideoCodec.H264) report("Browser output requires H.264; reconnect with HEVC disabled")
    }
    override fun onVideoConfig(type: Int, codecData: ByteArray) {
        if (type != MAIN_SCREEN || !running) return
        synchronized(lock) {
            if (lastConfig?.contentEquals(codecData) == true) return
            lastConfig = codecData.copyOf()
            generation++
            queue.clear()
            needsKeyFrame = true
            frames.clear()
            queue.offer(Job.Config(lastConfig!!, generation))
        }
    }
    override fun onVideoFrame(type: Int, naluBytes: ByteArray) {
        if (type != MAIN_SCREEN || !running || suspended) return
        val annexB = MediaCodecSupport.toAnnexB(naluBytes)
        if (annexB.isEmpty()) return
        synchronized(lock) {
            val keyFrame = MediaCodecSupport.isRandomAccess(annexB, VideoCodec.H264)
            if (needsKeyFrame && !keyFrame) return
            if (queue.offer(Job.Frame(annexB, generation))) {
                if (keyFrame) needsKeyFrame = false
            } else {
                resetChain()
                recovery?.invoke()
            }
        }
    }
    override fun onScreenStreamActive(type: Int, active: Boolean) {
        if (type != MAIN_SCREEN || active) return
        synchronized(lock) {
            lastConfig = null
            generation++
            recovery = null
            diagnostic = null
            queue.clear()
            needsKeyFrame = true
            frames.clear()
            queue.offer(Job.Reset)
        }
    }
    private fun resetChain() {
        generation++
        queue.clear()
        needsKeyFrame = true
        queue.offer(Job.Reset)
        lastConfig?.let { queue.offer(Job.Config(it, generation)) }
    }
    fun setSuspended(value: Boolean) = synchronized(lock) {
        if (suspended == value) return
        suspended = value
        resetChain()
        if (value) { queue.clear(); queue.offer(Job.Reset); frames.clear() }
    }
    private fun decode() {
        var codec: MediaCodec? = null
        var codecGeneration = -1L
        var pending: Job.Frame? = null
        var lastJpegNanos = 0L
        val info = MediaCodec.BufferInfo()
        try {
            while (running) {
                try {
                    if (pending?.generation != generation) pending = null
                    val job = pending ?: queue.poll(5, TimeUnit.MILLISECONDS)
                    if (job is Job.Config && job.generation != generation || job is Job.Frame && job.generation != generation) continue
                    when (job) {
                        is Job.Config -> {
                            codec?.release()
                            codec = null
                            val (sps, pps) = MediaCodecSupport.avcParameterSets(job.bytes)
                            require(sps.isNotEmpty() && pps.isNotEmpty()) { "Invalid AVC configuration" }
                            val size = display.resolution
                            val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, size.width, size.height).apply {
                                setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
                                setByteBuffer("csd-0", ByteBuffer.wrap(START_CODE + sps))
                                setByteBuffer("csd-1", ByteBuffer.wrap(START_CODE + pps))
                                setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, size.width * size.height)
                            }
                            val next = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
                            try { next.configure(format, null, null, 0); next.start(); codec = next; codecGeneration = job.generation }
                            catch (failure: Exception) { next.release(); throw failure }
                            report(null)
                        }
                        is Job.Frame -> {
                            val current = codec
                            if (current != null) {
                                val index = current.dequeueInputBuffer(0)
                                if (index >= 0) {
                                    val buffer = current.getInputBuffer(index) ?: error("Decoder input unavailable")
                                    buffer.clear()
                                    buffer.put(job.bytes)
                                    current.queueInputBuffer(index, 0, job.bytes.size, System.nanoTime() / 1000, 0)
                                    pending = null
                                } else pending = job
                            } else pending = null
                        }
                        Job.Reset -> { codec?.release(); codec = null; pending = null }
                        null -> Unit
                    }
                    codec?.let { current ->
                        // Drain the complete prediction chain, but cap software conversion independently
                        // when the iPhone negotiated 60 fps for WebRTC before falling back to JPEG.
                        repeat(16) {
                            val index = current.dequeueOutputBuffer(info, 0)
                            if (index >= 0) {
                                try {
                                    val now = System.nanoTime()
                                    if (info.size > 0 && now - lastJpegNanos >= 1_000_000_000L / display.jpegFps) {
                                        val image = current.getOutputImage(index) ?: error("Decoder does not expose YUV images")
                                        try {
                                            require(image.format == ImageFormat.YUV_420_888)
                                            val crop = image.cropRect
                                            val width = crop.width() and -2
                                            val height = crop.height() and -2
                                            val nv21 = YuvPlanes.nv21(image.planes.map {
                                                YuvPlanes.Plane(it.buffer, it.rowStride, it.pixelStride)
                                            }, crop.left, crop.top, width, height)
                                            val output = ByteArrayOutputStream()
                                            check(YuvImage(nv21, ImageFormat.NV21, width, height, null)
                                                .compressToJpeg(Rect(0, 0, width, height), display.jpegQuality, output))
                                            val published = synchronized(lock) {
                                                if (running && codecGeneration == generation && !needsKeyFrame) {
                                                    frames.publish(output.toByteArray()); true
                                                } else false
                                            }
                                            if (published && rendered.compareAndSet(false, true)) diagnostic?.invoke("first frame rendered")
                                            lastJpegNanos = now
                                        } finally { image.close() }
                                    }
                                } finally { current.releaseOutputBuffer(index, false) }
                            }
                        }
                    }
                    if (pending != null) Thread.sleep(2)
                } catch (interrupted: InterruptedException) {
                    break
                } catch (failure: Exception) {
                    report("Browser decoder: ${failure.javaClass.simpleName}: ${failure.message}")
                    runCatching { codec?.release() }
                    codec = null
                    pending = null
                    synchronized(lock) { resetChain() }
                    recovery?.invoke()
                    // Bound failure recovery when a vendor decoder cannot expose buffer-mode YUV.
                    Thread.sleep(500)
                }
            }
        } catch (_: InterruptedException) {
            // Closed by session teardown.
        } finally { runCatching { codec?.release() } }
    }
    override fun close() {
        running = false
        thread.interrupt()
        queue.clear()
        frames.clear()
    }
    companion object {
        const val MAIN_SCREEN = 110
        private val START_CODE = byteArrayOf(0, 0, 0, 1)
    }
}
