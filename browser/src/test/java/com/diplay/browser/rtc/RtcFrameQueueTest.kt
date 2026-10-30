package com.diplay.browser.rtc

import org.junit.Assert.*
import org.junit.Test

class RtcFrameQueueTest {
    @Test fun conversionRunsOnlyForAdmittedFramesAndKeepsTheOwnedResult() {
        val queue = RtcFrameQueue()
        var copies = 0
        val owned = byteArrayOf(1)
        fun offer(key: Boolean, now: Long = 0, size: Int = 1) =
            queue.offer(size, now, key, now) { copies++; owned }

        repeat(60) { assertFalse(offer(key = false)) }
        assertEquals("Waiting for IDR must not convert/copy discarded P frames", 0, copies)
        assertTrue(offer(key = true))
        assertSame("The queue must not copy an already-owned conversion a second time", owned, queue.poll(0)!!.bytes)
        assertEquals(1, copies)

        repeat(RtcFrameQueue.MAX_FRAMES) { assertTrue(offer(key = false)) }
        val beforeOverflow = copies
        assertFalse(offer(key = false))
        assertEquals(beforeOverflow, copies)
        assertTrue(queue.needsKey)
        assertFalse(offer(key = true, size = RtcFrameQueue.MAX_BYTES + 1))
        assertEquals(beforeOverflow, copies)

        assertTrue(offer(key = true))
        val beforeExpiry = copies
        assertFalse(offer(key = false, now = RtcFrameQueue.MAX_AGE_NS))
        assertEquals(beforeExpiry, copies)
        assertNull(queue.poll(RtcFrameQueue.MAX_AGE_NS))
        assertTrue(queue.needsKey)
    }

    @Test fun overflowAndStaleFramesRequireNewKeyframe() {
        val queue=RtcFrameQueue()
        assertFalse(queue.offer(byteArrayOf(1),0,false,0))
        assertTrue(queue.offer(byteArrayOf(2),0,true,0))
        repeat(5){assertTrue(queue.offer(byteArrayOf(3),it+1L,false,0))}
        assertFalse(queue.offer(byteArrayOf(4),7,false,0));assertNull(queue.poll(0));assertTrue(queue.needsKey)
        assertTrue(queue.offer(byteArrayOf(5),8,true,0))
        assertNull(queue.poll(50_000_000));assertTrue(queue.needsKey)
        assertFalse(queue.offer(byteArrayOf(6),9,false,50_000_000))
        assertTrue(queue.offer(byteArrayOf(7),10,true,50_000_000))
        assertEquals(7,queue.poll(50_000_000)!!.bytes[0].toInt())
        assertEquals(6, queue.overflowFrames)
        assertEquals(1, queue.expiredFrames)
        assertEquals(3, queue.keyframeSkips)
    }
    @Test fun queueOwnsFrameCopyAndBoundsMemory() {
        val bytes=byteArrayOf(1);val queue=RtcFrameQueue()
        assertTrue(queue.offer(bytes,0,true,0));bytes[0]=9
        assertEquals(1,queue.poll(0)!!.bytes[0].toInt())
        assertFalse(queue.offer(ByteArray(2*1024*1024+1),0,true,0));assertEquals(0,queue.size)
        assertEquals(1, queue.overflowFrames)
    }
    @Test fun queueExpiryIsExactlyFiftyMillisecondsAndNeverLeaksADependentFrame() {
        val queue = RtcFrameQueue()
        assertTrue(queue.offer(byteArrayOf(1), 0, true, 0))
        assertEquals(1, queue.poll(49_999_999)!!.bytes[0].toInt())
        assertTrue(queue.offer(byteArrayOf(2), 1, false, 50_000_000))
        assertTrue(queue.offer(byteArrayOf(3), 2, false, 60_000_000))
        assertNull(queue.poll(100_000_000))
        assertEquals(2, queue.expiredFrames)
        assertEquals(0, queue.bytes)
        assertFalse(queue.offer(byteArrayOf(4), 3, false, 100_000_001))
        assertTrue(queue.offer(byteArrayOf(5), 4, true, 100_000_002))
        assertEquals(5, queue.poll(100_000_002)!!.bytes[0].toInt())
    }
    @Test fun parameterPrefixesCountTowardTheMemoryBudgetAndOversizeInvalidatesReferences() {
        val queue = RtcFrameQueue()
        assertTrue(queue.offer(byteArrayOf(1), 0, true, 0))
        assertFalse(queue.offer(ByteArray(RtcFrameQueue.MAX_BYTES), 1, true, 0, extraBytes = 1))
        assertEquals(2, queue.overflowFrames)
        assertTrue(queue.needsKey)
        assertEquals(0, queue.bytes)
        assertTrue(queue.offer(ByteArray(RtcFrameQueue.MAX_BYTES - 100), 2, true, 0, extraBytes = 100))
        assertEquals(RtcFrameQueue.MAX_BYTES, queue.bytes)
        queue.poll(0)
        assertEquals(0, queue.bytes)
    }
    @Test fun localLossNotificationSurvivesReplacementKeyframesAndReportsTheFirstLossOnce() {
        val queue = RtcFrameQueue()
        assertTrue(queue.offer(byteArrayOf(1), 0, true, 0))
        assertNull(queue.poll(50_000_000))
        assertTrue(queue.offer(byteArrayOf(2), 500_000_000, true, 500_000_000))
        assertNull(queue.poll(550_000_000))
        assertEquals(50_000_000L, queue.takeSendFailure())
        assertNull(queue.takeSendFailure())
        assertFalse(queue.offer(ByteArray(RtcFrameQueue.MAX_BYTES + 1), 600_000_000, true, 600_000_000))
        assertTrue(queue.offer(byteArrayOf(3), 700_000_000, true, 700_000_000))
        assertEquals(600_000_000L, queue.takeSendFailure())
        queue.invalidate(700_000_001)
        assertNull("Invalidation is already accounted for by native send/disconnect health", queue.takeSendFailure())
        assertFalse(queue.offer(ByteArray(RtcFrameQueue.MAX_BYTES + 1), 800_000_000, true, 800_000_000))
        queue.clear()
        assertNull("A new session must not inherit an old queue failure", queue.takeSendFailure())
    }
    @Test fun repeatedExpiredKeyframesCannotExtendAnyRecoveryPolicyWithFreshStaticFeedback() {
        for (policy in RtcRecoveryPolicy.entries) {
            val queue = RtcFrameQueue()
            val health = RtcHealth(0, policy)
            health.ready(0); health.sent(0); health.feedback(1, 0)
            val firstLoss = 550_000_000L
            val deadline = firstLoss + policy.graceNanos
            var offered = 500_000_000L
            while (offered + RtcFrameQueue.MAX_AGE_NS <= deadline) {
                assertTrue(queue.offer(byteArrayOf(1), offered, true, offered))
                val now = offered + RtcFrameQueue.MAX_AGE_NS
                assertNull(queue.poll(now))
                queue.takeSendFailure()?.let(health::sendFailed)
                health.feedback(1, now)
                if (now < deadline) {
                    assertNull("$policy must retain its full recovery budget", health.failureReason(now))
                } else {
                    assertEquals("$policy must expire even though no native send has succeeded", "send-timeout", health.failureReason(now))
                }
                offered += 500_000_000L
            }
            assertTrue(queue.expiredFrames > 1)
        }
    }
    @Test fun keyframeRecoveryCountsActiveTimeAndResetsAfterASourcePause() {
        val queue = RtcFrameQueue()
        val grace = RtcRecoveryPolicy.QUICK.graceNanos
        for (second in 0..3) {
            val now = second * 1_000_000_000L
            assertFalse(queue.offer(byteArrayOf(1), now, false, now))
            assertFalse(queue.recoveryExpired(now, grace))
        }
        assertFalse(queue.offer(byteArrayOf(1), grace, false, grace))
        assertTrue(queue.recoveryExpired(grace, grace))
        assertFalse(queue.recoveryExpired(60_000_000_000, grace))
        assertFalse(queue.offer(byteArrayOf(1), 60_000_000_000, false, 60_000_000_000))
        assertFalse(queue.recoveryExpired(60_000_000_000, grace))
        assertTrue(queue.offer(byteArrayOf(2), 60_000_000_001, true, 60_000_000_001))
        assertFalse(queue.recovering(60_000_000_001))
        queue.invalidate(60_000_000_002)
        assertEquals(1, queue.invalidatedFrames)
        queue.reset()
        assertEquals(0, queue.invalidatedFrames)
        assertEquals(0, queue.keyframeSkips)
        assertFalse(queue.recovering(60_000_000_003))
    }
}
