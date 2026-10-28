package com.diplay.browser.rtc

import org.junit.Assert.*
import org.junit.Test

class RtcRetryPolicyTest {
    @Test fun aNanoTimeOriginBeforeZeroAndAWrappingDeadlineRemainUsable() {
        var now = -100L
        val policy = RtcRetryPolicy { now }
        assertTrue(policy.start()); policy.finish()
        assertEquals(5_000L, policy.retryAfterMs)
        now += 5_000_000_000; assertTrue(policy.available)
        policy.reset(); now = Long.MAX_VALUE - 1_000
        assertTrue(policy.start()); policy.finish()
        assertEquals(5_000L, policy.retryAfterMs)
        now += 5_000_000_000; assertTrue(policy.available)
    }

    @Test fun transientAttemptsUseFiveTenTwentyThenThirtySecondsWithoutOverlapping() {
        var now = 0L
        val policy = RtcRetryPolicy { now }
        for (delay in listOf(5_000L, 10_000L, 20_000L, 30_000L, 30_000L)) {
            assertTrue(policy.start())
            assertFalse(policy.start())
            policy.finish()
            assertEquals(delay, policy.retryAfterMs)
            assertFalse(policy.start())
            now += delay * 1_000_000 - 1
            assertFalse(policy.available)
            assertEquals(1L, policy.retryAfterMs)
            now++
            assertTrue(policy.available)
        }
    }

    @Test fun duplicateStopsCannotAdvanceOrPostponeTheBackoff() {
        var now = 0L
        val policy = RtcRetryPolicy { now }
        policy.start(); policy.finish()
        now += 2_000_000_000
        repeat(10) { policy.finish(); assertEquals(3_000L, policy.retryAfterMs) }
        now += 3_000_000_000
        assertTrue(policy.start()); policy.finish()
        assertEquals(10_000L, policy.retryAfterMs)
    }

    @Test fun aLatePermanentRejectionBlocksTheAttemptUntilTheConfigurationIsReset() {
        var now = 0L
        val policy = RtcRetryPolicy { now }
        policy.start(); policy.finish(); policy.finish(retryable = false)
        now += 1_000_000_000_000
        assertTrue(policy.blocked); assertFalse(policy.available); assertFalse(policy.start())
        policy.reset(); policy.finish(retryable = false)
        assertFalse(policy.blocked); assertFalse(policy.attempted); assertTrue(policy.start())
        policy.finish(); assertEquals(5_000L, policy.retryAfterMs)
    }

    @Test fun briefPlaybackAndNegotiationTimeDoNotResetAFlappingConnection() {
        var now = 0L
        val policy = RtcRetryPolicy { now }
        policy.start(); policy.finish(); now += 5_000_000_000
        policy.start(); policy.healthy(); now += 30_000_000_000; policy.finish()
        assertEquals(10_000L, policy.retryAfterMs)
        now += 10_000_000_000
        policy.start(); now += 60_000_000_000; policy.finish()
        assertEquals(20_000L, policy.retryAfterMs)
    }

    @Test fun aHealthyMinuteResetsBackoffButARecoveryGapRestartsThatMinute() {
        var now = 0L
        val policy = RtcRetryPolicy { now }
        policy.start(); policy.finish(); now += 5_000_000_000
        policy.start(); policy.healthy(); now += 59_000_000_000
        policy.interrupted(); now += 2_000_000_000; policy.healthy()
        now += 59_999_999_999; policy.finish()
        assertEquals(10_000L, policy.retryAfterMs)
        now += 10_000_000_000
        policy.start(); policy.healthy(); now += 60_000_000_000; policy.finish()
        assertEquals(5_000L, policy.retryAfterMs)
    }

    @Test fun aLifecycleResetCancelsCooldownAndPermanentBlocksWithoutAnAttempt() {
        val policy = RtcRetryPolicy { 100_000_000L }
        policy.start(); policy.finish(false)
        policy.reset()
        assertTrue(policy.available); assertFalse(policy.inFlight); assertFalse(policy.attempted)
        assertEquals(0L, policy.retryAfterMs)
    }
}
