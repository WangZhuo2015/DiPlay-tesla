package com.diplay.browser

import com.shilapi.xcertplay.airplay.AirPlayContact

/** One driver's input lease. Lost releases expire, and a second page cannot steal a held touch. */
class BrowserControl(
    private val send: (List<AirPlayContact>) -> Boolean,
    private val now: () -> Long = { System.nanoTime() / 1_000_000 },
) {
    private var owner: String? = null
    private var lastInput = 0L
    private var held = false
    @Synchronized fun touch(client: String, contacts: List<AirPlayContact>): Boolean {
        require(client.matches(Regex("[a-zA-Z0-9-]{8,64}")))
        require(contacts.size <= 2 && contacts.map { it.id }.distinct().size == contacts.size)
        require(contacts.all { it.id in 0..1 && it.x.isFinite() && it.y.isFinite() && it.x in 0.0..1.0 && it.y in 0.0..1.0 && it.down })
        expire()
        if (owner != null && owner != client && held) return false
        if (!send(contacts)) return false
        owner = if (contacts.isEmpty()) null else client
        held = contacts.isNotEmpty()
        lastInput = now()
        return true
    }
    @Synchronized fun expire() {
        if (held && now() - lastInput >= RELEASE_TIMEOUT_MS) release()
    }
    @Synchronized fun release() {
        if (held) send(emptyList())
        held = false
        owner = null
    }
    companion object { const val RELEASE_TIMEOUT_MS = 1000L }
}
