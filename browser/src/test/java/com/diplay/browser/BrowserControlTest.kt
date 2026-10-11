package com.diplay.browser

import com.shilapi.xcertplay.airplay.AirPlayContact
import org.junit.Assert.*
import org.junit.Test

class BrowserControlTest {
    @Test fun releasePreservesDockCoordinatesAndEndsTheInputLease() {
        val sent = mutableListOf<List<AirPlayContact>>()
        val control = BrowserControl({ sent += it; true })
        val press = AirPlayContact(0, .04, .6, true)
        assertTrue(control.touch("client-one", listOf(press)))
        assertTrue(control.touch("client-one", listOf(press.copy(down = false))))
        assertEquals(listOf(press.copy(down = false)), sent.last())
        assertTrue(control.touch("client-two", listOf(press)))
    }
    @Test fun remainingSecondFingerKeepsItsHidSlotAfterTheFirstFingerLifts() {
        val sent = mutableListOf<List<AirPlayContact>>()
        val control = BrowserControl({ sent += it; true })
        val first = AirPlayContact(0, .1, .2, true)
        val second = AirPlayContact(1, .8, .6, true)
        control.touch("client-one", listOf(first, second))
        control.touch("client-one", listOf(first.copy(down = false), second))
        control.touch("client-one", listOf(second.copy(x = .9)))
        assertEquals(listOf(first.copy(down = false), second.copy(x = .9)), sent.last())
        assertFalse(control.touch("client-two", listOf(second.copy(down = false))))
        control.touch("client-one", listOf(second.copy(x = .9, down = false)))
        assertEquals(listOf(first.copy(down = false), second.copy(x = .9, down = false)), sent.last())
        assertTrue(control.touch("client-two", listOf(first)))
    }
    @Test fun lostTouchReleaseExpiresAndAnotherClientCannotStealHeldInput() {
        var time = 0L
        val sent = mutableListOf<List<AirPlayContact>>()
        val control = BrowserControl({ sent += it; true }, { time })
        val finger = listOf(AirPlayContact(0, .5, .25, true))
        assertTrue(control.touch("client-one", finger))
        assertFalse(control.touch("client-two", finger))
        time = 999
        control.expire()
        assertEquals(1, sent.size)
        time = 1000
        control.expire()
        assertEquals(emptyList<AirPlayContact>(), sent.last())
        assertTrue(control.touch("client-two", finger))
        control.release()
        assertEquals(emptyList<AirPlayContact>(), sent.last())
    }
    @Test fun validationRejectsNonFiniteOutOfRangeAndDuplicateContacts() {
        val control = BrowserControl({ true })
        for (points in listOf(
            listOf(AirPlayContact(0, Double.NaN, 0.0, true)),
            listOf(AirPlayContact(0, 1.01, 0.0, true)),
            listOf(AirPlayContact(3, .1, .1, true)),
            listOf(AirPlayContact(0, .1, .1, true), AirPlayContact(0, .2, .2, true)),
        )) assertThrows(IllegalArgumentException::class.java) { control.touch("client-one", points) }
    }
    @Test fun rejectedInputDoesNotAcquireLease() {
        var allowed = false
        val control = BrowserControl({ allowed })
        assertFalse(control.touch("client-one", listOf(AirPlayContact(0,.1,.1,true))))
        allowed = true
        assertTrue(control.touch("client-two", listOf(AirPlayContact(0,.1,.1,true))))
    }
}
