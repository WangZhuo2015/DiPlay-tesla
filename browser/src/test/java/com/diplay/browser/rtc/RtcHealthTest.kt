package com.diplay.browser.rtc

import org.junit.Assert.*
import org.junit.Test

class RtcHealthTest {
    private fun seconds(value: Int) = value * 1_000_000_000L
    @Test fun stillScreenRemainsHealthyWithUnchangedDecodedCount() {
        val health = RtcHealth(0)
        health.ready(0); health.sent(0)
        for (second in 1..120) {
            health.feedback(1, seconds(second))
            assertFalse(health.expired(seconds(second)))
        }
        assertTrue(health.expired(seconds(130)))
    }
    @Test fun aQuietMinuteDoesNotConsumeTheDecoderRecoveryBudget() {
        for (policy in RtcRecoveryPolicy.entries) {
            val health = RtcHealth(0, policy)
            health.ready(0); health.sent(0); health.feedback(1, 0)
            for (second in 1..60) {
                health.feedback(1, seconds(second))
                assertFalse(health.expired(seconds(second)))
            }
            for (second in 60 until 60 + policy.graceMs / 1000) {
                val now = second * 1_000_000_000
                health.sent(now); health.feedback(1, now)
                assertFalse("$policy must allow recovery after a still screen", health.expired(now))
            }
            val end = seconds(60) + policy.graceNanos
            health.sent(end); health.feedback(1, end)
            assertEquals("decoder-stall", health.failureReason(end))
            health.feedback(2, end)
            assertFalse(health.expired(end))
            assertFalse(health.recovering(end))
        }
    }
    @Test fun aPausedSourceAndAReplacedReceiverCounterResetTheStall() {
        val health = RtcHealth(0, RtcRecoveryPolicy.QUICK)
        health.ready(0); health.feedback(10, 0)
        for (second in 1..3) { health.sent(seconds(second)); health.feedback(10, seconds(second)) }
        assertTrue(health.needsKeyframe(seconds(3)))
        health.feedback(10, seconds(6))
        assertFalse(health.expired(seconds(6)))
        health.sent(seconds(7)); health.feedback(10, seconds(7))
        assertFalse(health.expired(seconds(7)))
        health.feedback(0, seconds(7))
        assertFalse(health.recovering(seconds(7)))
    }
    @Test fun temporaryDisconnectionKeepsThePeerAndRepeatedEventsDoNotMoveTheDeadline() {
        for (policy in RtcRecoveryPolicy.entries) {
            val health = RtcHealth(0, policy)
            health.ready(0); health.feedback(1, 0)
            health.disconnected(seconds(1)); health.disconnected(seconds(2))
            val deadline = seconds(1) + policy.graceNanos
            health.feedback(1, deadline - 1)
            assertFalse(health.expired(deadline - 1))
            assertTrue(health.recovering(deadline - 1))
            assertEquals("disconnected-timeout", health.failureReason(deadline))
            health.connected(deadline)
            assertFalse(health.expired(deadline))
            assertFalse(health.recovering(deadline))
            health.disconnected(deadline + seconds(1))
            assertFalse(health.expired(deadline + seconds(2)))
        }
    }
    @Test fun successfulSendCancelsTheFailureTimerAndFreshFailureGetsItsOwnBudget() {
        val health = RtcHealth(0, RtcRecoveryPolicy.QUICK)
        health.ready(0); health.feedback(1, 0)
        health.sendFailed(seconds(1)); health.sendFailed(seconds(3))
        health.feedback(1, seconds(4))
        assertFalse(health.expired(seconds(4)))
        assertTrue(health.needsKeyframe(seconds(4)))
        health.sent(seconds(4)); health.feedback(2, seconds(4))
        assertFalse(health.expired(seconds(5)))
        health.sendFailed(seconds(6)); health.feedback(2, seconds(9))
        assertFalse(health.expired(seconds(9)))
        assertEquals("send-timeout", health.failureReason(seconds(10)))
    }
    @Test fun reconnectAndReceiverFeedbackCannotCancelAnUnrecoveredLocalSendFailure() {
        val health = RtcHealth(0, RtcRecoveryPolicy.QUICK)
        health.ready(0); health.sent(0); health.feedback(1, 0)
        health.sendFailed(seconds(2))
        // A queue drop observed after a native failure can carry an earlier timestamp.
        health.sendFailed(seconds(1))
        health.disconnected(seconds(3)); health.connected(seconds(4))
        health.feedback(1, seconds(4))
        assertTrue(health.recovering(seconds(4)))
        assertEquals("send-timeout", health.failureReason(seconds(5)))
        health.sent(seconds(5)); health.feedback(2, seconds(5))
        assertFalse(health.recovering(seconds(5)))
        assertNull(health.failureReason(seconds(5)))
    }
    @Test fun initialPlaybackHasABoundedTimeout() {
        for (policy in RtcRecoveryPolicy.entries) {
            val health = RtcHealth(0, policy)
            health.feedback(0, policy.firstFrameNanos - 1)
            assertFalse(health.expired(policy.firstFrameNanos - 1))
            assertEquals("first-frame-timeout", health.failureReason(policy.firstFrameNanos))
        }
    }
    @Test fun missingReceiverFeedbackHasTheChosenBudgetEvenForAStillScreen() {
        for (policy in RtcRecoveryPolicy.entries) {
            val health = RtcHealth(0, policy)
            health.ready(0); health.feedback(1, 0)
            assertFalse(health.expired(policy.graceNanos - 1))
            assertEquals("receiver-feedback-timeout", health.failureReason(policy.graceNanos))
        }
        assertEquals(RtcRecoveryPolicy.BALANCED, RtcRecoveryPolicy.fromMillis(Long.MAX_VALUE))
    }
}
