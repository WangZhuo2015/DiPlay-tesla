package com.diplay.browser

import org.junit.Assert.*
import org.junit.Test

class BrowserPairingTest {
    @Test fun codesRequireOwnerOpenedWindowAndExpireWithoutRevokingExistingTokens() {
        var now = 0L
        val pairing = BrowserPairing({ now }, { 123 })
        assertFalse(pairing.accept("000123"))
        assertEquals("000123", pairing.begin())
        assertTrue(pairing.accept("000123"))
        now = 299_999
        assertTrue(pairing.accept("000123"))
        now = 300_000
        assertFalse(pairing.accept("000123"))
        pairing.begin()
        assertTrue(pairing.accept("000123"))
    }

    @Test fun fiveWrongAttemptsCloseWindowUntilOwnerOpensItAgain() {
        var next = 123456
        val pairing = BrowserPairing({ 0 }, { next })
        pairing.begin()
        repeat(5) { assertFalse(pairing.accept("654321")) }
        assertFalse(pairing.accept("123456"))
        next = 345678
        assertEquals("345678", pairing.begin())
        assertFalse(pairing.accept("123456"))
        assertTrue(pairing.accept("345678"))
    }
}
