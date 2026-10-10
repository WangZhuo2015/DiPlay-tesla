package com.diplay.browser

import com.shilapi.xcertplay.airplay.AirPlayContact
import org.junit.Assert.*
import org.junit.Test

class BrowserControlTest {
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
