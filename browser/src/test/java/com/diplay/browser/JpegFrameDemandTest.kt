package com.diplay.browser

import org.junit.Assert.*
import org.junit.Test

class JpegFrameDemandTest {
    @Test fun aViewerlessStreamGetsOneRealStartupProofThenSleeps() {
        var now = 0L
        val frames = LatestFrame { now }
        val demand = JpegFrameDemand(frames)
        var conversions = 0
        var proofs = 0
        // More than the wireless handoff deadline without a browser request.
        repeat(1_200) {
            if (demand.needed()) {
                conversions++
                frames.publish(byteArrayOf(1))
                if (demand.published()) proofs++
            }
            now += 50_000_000L
        }
        assertEquals(1, conversions)
        assertEquals(1, proofs)
        assertFalse(frames.hasDemand())
        assertFalse(demand.needed())
    }

    @Test fun startupNeedsSuccessfulPublicationAndResetsForTheNextStream() {
        val demand = JpegFrameDemand(LatestFrame { 0L })
        // Configuration, compressed packets, and failed conversion cannot grant proof.
        repeat(10) { assertTrue(demand.needed()) }
        assertTrue(demand.published())
        assertFalse(demand.needed())
        assertFalse(demand.published())
        demand.reset()
        assertTrue(demand.needed())
        assertTrue(demand.published())
        assertFalse(demand.needed())
    }

    @Test fun returningViewersRenewWorkWithoutRepeatingStartupProof() {
        var now = 0L
        val frames = LatestFrame { now }
        val demand = JpegFrameDemand(frames)
        assertTrue(demand.published())
        now = 10_000_000_000L
        frames.request()
        repeat(30) {
            assertTrue(demand.needed())
            assertFalse(demand.published())
            now += 100_000_000L
            frames.request()
        }
        now += 2_000_000_000L
        assertFalse(demand.needed())
        frames.request()
        assertTrue(demand.needed())
        assertFalse(demand.published())
    }
}
