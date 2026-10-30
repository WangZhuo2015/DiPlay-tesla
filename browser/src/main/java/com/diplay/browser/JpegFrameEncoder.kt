package com.diplay.browser

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

/**
 * One software conversion in flight, with no backlog. The decoder can keep draining
 * reference frames while a slow CPU compresses JPEG. Only the published JPEG is copied;
 * the full-size NV21 buffer and compression scratch space are reused.
 */
internal class JpegFrameEncoder(
    fps: Int,
    private val quality: Int,
    private val publish: (Long, ByteArray) -> Unit,
    private val report: (Long, String) -> Unit,
    private val clock: () -> Long = System::nanoTime,
    private val compress: (ByteArray, Int, Int, Int, ByteArrayOutputStream) -> Boolean = { data, width, height, q, output ->
        YuvImage(data, ImageFormat.NV21, width, height, null).compressToJpeg(Rect(0, 0, width, height), q, output)
    },
) : Closeable {
    private val pacer = JpegFramePacer(fps)
    private val worker = Executors.newSingleThreadExecutor { Thread(it, "tesla-jpeg-encode").apply { isDaemon = true } }
    private val busy = AtomicBoolean()
    @Volatile private var running = true
    private var pixels = ByteArray(0)
    private val output = ByteArrayOutputStream()

    fun canAccept(): Boolean = running && !busy.get() && pacer.ready(clock())

    /** copy runs synchronously while the codec image is valid, only after admission. */
    fun offer(width: Int, height: Int, generation: Long, copy: (ByteArray) -> Unit): Boolean {
        if (!canAccept() || !busy.compareAndSet(false, true)) return false
        if (!running || !pacer.ready(clock())) { busy.set(false); return false }
        val started = clock()
        try {
            require(width > 0 && height > 0 && width % 2 == 0 && height % 2 == 0)
            val size = width.toLong() * height * 3 / 2
            require(size <= Int.MAX_VALUE)
            if (pixels.size != size.toInt()) pixels = ByteArray(size.toInt())
            copy(pixels)
            worker.execute {
                try {
                    if (running) {
                        output.reset()
                        check(compress(pixels, width, height, quality, output)) { "JPEG compression failed" }
                        // The reusable output buffer never escapes into HTTP responses.
                        if (running) publish(generation, output.toByteArray())
                    }
                } catch (failure: Exception) {
                    if (running) report(generation, "Browser JPEG: ${failure.javaClass.simpleName}: ${failure.message}")
                } finally {
                    pacer.completed(started, clock())
                    busy.set(false)
                }
            }
            return true
        } catch (_: RejectedExecutionException) {
            busy.set(false)
            return false
        } catch (failure: Exception) {
            busy.set(false)
            throw failure
        }
    }

    override fun close() {
        running = false
        worker.shutdownNow()
    }
}

/** A conversion may use at most half of a sustained single-worker time budget. */
internal class JpegFramePacer(fps: Int) {
    private val periodNanos = 1_000_000_000L / fps.also { require(it in 1..60) }
    @Volatile private var nextFrameNanos: Long? = null
    fun ready(now: Long): Boolean = nextFrameNanos?.let { now - it >= 0 } ?: true
    fun completed(started: Long, finished: Long) {
        val elapsed = (finished - started).coerceAtLeast(0)
        // Fast devices retain the selected rate; slower conversion leaves an equal
        // interval for other work, including after the device throttles under heat.
        nextFrameNanos = finished + maxOf(periodNanos - elapsed, elapsed)
    }
}
