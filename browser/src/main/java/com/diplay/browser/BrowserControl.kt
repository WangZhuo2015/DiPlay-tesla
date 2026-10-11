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
    private var previous = emptyList<AirPlayContact>()
    @Synchronized fun touch(client: String, contacts: List<AirPlayContact>): Boolean {
        require(client.matches(Regex("[a-zA-Z0-9-]{8,64}")))
        require(contacts.size <= 2 && contacts.map { it.id }.distinct().size == contacts.size)
        require(contacts.all { it.id in 0..1 && it.x.isFinite() && it.y.isFinite() && it.x in 0.0..1.0 && it.y in 0.0..1.0 })
        expire()
        if (owner != null && owner != client && held) return false
        // HID report slots follow list positions. Keep finger 1 in slot 1 when finger 0 lifts.
        val report = if (contacts.isEmpty()) emptyList() else (0..contacts.maxOf { it.id }).map { id ->
            contacts.firstOrNull { it.id == id }
                ?: previous.firstOrNull { it.id == id }?.copy(down = false)
                ?: AirPlayContact(id, 0.0, 0.0, false)
        }
        if (!send(report)) return false
        held = contacts.any { it.down }
        owner = if (held) client else null
        previous = if (held) report else emptyList()
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
        previous = emptyList()
    }
    companion object { const val RELEASE_TIMEOUT_MS = 1000L }
}
