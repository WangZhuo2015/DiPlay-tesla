package com.diplay.browser

import org.junit.Assert.*
import org.junit.Test

class LatestFrameTest {
    @Test fun onlyRequestsCreateDemandAndInactiveViewersExpire() {
        var now = 0L
        val frames = LatestFrame { now }
        frames.publish(byteArrayOf(1))
        assertNotNull(frames.after(0))
        assertFalse(frames.hasDemand())
        frames.request()
        assertTrue(frames.hasDemand())
        now = 1_999_999_999L
        assertTrue(frames.hasDemand())
        now++
        assertFalse(frames.hasDemand())
        assertNotNull(frames.after(0))
        assertFalse(frames.hasDemand())
        frames.request()
        assertTrue(frames.hasDemand())
    }

    @Test fun clearingOldPicturesPreservesTheLiveViewerAndMonotonicSequence() {
        var now = 10L
        val frames = LatestFrame { now }
        frames.request()
        frames.publish(byteArrayOf(1))
        val previous = frames.after(0)!!.sequence
        frames.clear()
        assertNull(frames.after(previous))
        assertTrue(frames.hasDemand())
        frames.publish(byteArrayOf(2))
        assertTrue(frames.after(previous)!!.sequence > previous)
        now += 2_000_000_000L
        assertFalse(frames.hasDemand())
    }
}
