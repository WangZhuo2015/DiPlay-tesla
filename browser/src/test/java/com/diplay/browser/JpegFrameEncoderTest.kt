package com.diplay.browser

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class JpegFrameEncoderTest {
    @Test fun slowCompressionDoesNotBlockDecoderOrQueueAnotherPicture() {
        val started = CountDownLatch(1)
        val release = CountDownLatch(1)
        val published = CountDownLatch(1)
        val encoder = JpegFrameEncoder(30, 80, publish = { generation, bytes ->
            assertEquals(7L, generation)
            assertArrayEquals(byteArrayOf(42), bytes)
            published.countDown()
        }, report = { _, message -> error(message) }, compress = { pixels, _, _, _, output ->
            started.countDown()
            check(release.await(5, TimeUnit.SECONDS))
            output.write(pixels[0].toInt())
            true
        })
        try {
            assertTrue(encoder.offer(2, 2, 7) { it.fill(42) })
            assertTrue(started.await(5, TimeUnit.SECONDS))
            assertFalse(encoder.offer(2, 2, 8) { fail("Busy compression must not copy another image") })
            release.countDown()
            assertTrue(published.await(5, TimeUnit.SECONDS))
        } finally { release.countDown(); encoder.close() }
    }

    @Test fun reusesScratchBuffersWithoutMutatingPublishedJpegs() {
        val pixels = CopyOnWriteArrayList<ByteArray>()
        val outputs = CopyOnWriteArrayList<ByteArrayOutputStream>()
        val published = CopyOnWriteArrayList<ByteArray>()
        val encoder = JpegFrameEncoder(60, 80, publish = { _, jpeg -> published.add(jpeg) }, report = { _, message -> error(message) },
            compress = { bytes, _, _, _, output ->
                pixels.add(bytes); outputs.add(output); output.write(bytes[0].toInt()); true
            })
        try {
            for (index in 1..3) {
                await { encoder.canAccept() }
                assertTrue(encoder.offer(if (index == 3) 4 else 2, 2, 1) { it.fill(index.toByte()) })
                await { published.size == index }
            }
            assertSame(pixels[0], pixels[1])
            assertNotSame(pixels[1], pixels[2])
            assertSame(outputs[0], outputs[2])
            assertArrayEquals(byteArrayOf(1), published[0])
            assertArrayEquals(byteArrayOf(2), published[1])
            assertArrayEquals(byteArrayOf(3), published[2])
        } finally { encoder.close() }
    }

    @Test fun failedImageCopyReleasesTheSingleSlot() {
        val published = CountDownLatch(1)
        val encoder = JpegFrameEncoder(30, 80, publish = { _, _ -> published.countDown() }, report = { _, message -> error(message) },
            compress = { _, _, _, _, _ -> true })
        try {
            assertThrows(IllegalArgumentException::class.java) { encoder.offer(2, 2, 1) { throw IllegalArgumentException("Invalid image") } }
            assertTrue(encoder.offer(2, 2, 1) { it.fill(0) })
            assertTrue(published.await(5, TimeUnit.SECONDS))
        } finally { encoder.close() }
    }

    @Test fun closePreventsLatePublicationAndRejectsCopies() {
        val started = CountDownLatch(1)
        val release = CountDownLatch(1)
        val finished = CountDownLatch(1)
        val publications = AtomicInteger()
        val encoder = JpegFrameEncoder(30, 80, publish = { _, _ -> publications.incrementAndGet() }, report = { _, message -> error(message) },
            compress = { _, _, _, _, _ ->
                started.countDown()
                // Model a native compressor that cannot be interrupted mid-call.
                var done = false
                while (!done) try { done = release.await(5, TimeUnit.SECONDS) } catch (_: InterruptedException) { }
                finished.countDown()
                true
            })
        try {
            assertTrue(encoder.offer(2, 2, 1) { it.fill(1) })
            assertTrue(started.await(5, TimeUnit.SECONDS))
            encoder.close()
            assertFalse(encoder.offer(2, 2, 1) { fail("Closed encoder must not copy") })
            release.countDown()
            assertTrue(finished.await(5, TimeUnit.SECONDS))
            assertEquals(0, publications.get())
        } finally { release.countDown(); encoder.close() }
    }

    @Test fun compressionFailureRetainsItsGenerationAndReleasesTheSlot() {
        val reported = CopyOnWriteArrayList<Pair<Long, String>>()
        val calls = AtomicInteger()
        val published = CountDownLatch(1)
        val encoder = JpegFrameEncoder(60, 80, publish = { _, _ -> published.countDown() },
            report = { generation, message -> reported.add(generation to message) },
            compress = { _, _, _, _, _ -> calls.incrementAndGet() > 1 })
        try {
            assertTrue(encoder.offer(2, 2, 41) { it.fill(0) })
            await { reported.isNotEmpty() }
            assertEquals(41L, reported.single().first)
            assertTrue(reported.single().second.contains("JPEG compression failed"))
            await { encoder.canAccept() }
            assertTrue(encoder.offer(2, 2, 42) { it.fill(0) })
            assertTrue(published.await(5, TimeUnit.SECONDS))
        } finally { encoder.close() }
    }

    @Test fun fastConversionRetainsConfiguredRateAndSlowConversionGetsAnEqualRestInterval() {
        val fast = JpegFramePacer(20)
        assertTrue(fast.ready(0))
        fast.completed(0, 10_000_000)
        assertFalse(fast.ready(49_999_999))
        assertTrue(fast.ready(50_000_000))
        val slow = JpegFramePacer(30)
        slow.completed(0, 60_000_000)
        assertFalse(slow.ready(119_999_999))
        assertTrue(slow.ready(120_000_000))
        slow.completed(120_000_000, 130_000_000)
        assertFalse(slow.ready(153_333_332))
        assertTrue(slow.ready(153_333_333))
    }

    private fun await(condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (!condition() && System.nanoTime() < deadline) Thread.sleep(1)
        assertTrue("Worker did not complete in time", condition())
    }
}
