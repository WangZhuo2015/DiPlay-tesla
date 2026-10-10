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
        assertTrue(health.expired(seconds(125)))
    }
    @Test fun incomingFramesWithoutDecoderProgressTriggerFallback() {
        val health = RtcHealth(0)
        health.ready(0); health.feedback(1, 0)
        health.feedback(1, seconds(6)); health.sent(seconds(6))
        assertTrue(health.expired(seconds(6)))
        health.feedback(2, seconds(6))
        assertFalse(health.expired(seconds(6)))
    }
    @Test fun initialPlaybackHasABoundedTimeout() {
        val health = RtcHealth(0)
        health.feedback(0, seconds(10))
        assertFalse(health.expired(seconds(10)))
        assertTrue(health.expired(seconds(11)))
    }
}
