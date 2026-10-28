package com.diplay.browser.rtc

/**
 * One viewer/configuration's retry gate, confined to the RTC worker's monotonic nanosecond clock.
 * Adapted from WheelPlay 44635dd94e95 (GPL-3.0); interruptions also reset the healthy interval.
 */
internal class RtcRetryPolicy(private val clock: () -> Long) {
    private var failures = 0
    private var retryAt: Long? = null
    private var healthySince: Long? = null
    var inFlight = false
        private set
    var attempted = false
        private set
    var blocked = false
        private set

    val available get() = !blocked && !inFlight && retryAt?.let { clock() - it >= 0 } != false
    val retryAfterMs get() = if (blocked || inFlight) 0L else
        ((retryAt?.let { it - clock() } ?: 0L).coerceAtLeast(0) + 999_999L) / 1_000_000L

    fun start(): Boolean {
        if (!available) return false
        attempted = true; inFlight = true; healthySince = null
        return true
    }

    fun healthy() {
        if (!inFlight) return
        val now = clock()
        val since = healthySince ?: now.also { healthySince = it }
        if (now - since >= STABLE_NANOS) failures = 0
    }

    fun interrupted() { healthySince = null }

    fun finish(retryable: Boolean = true) {
        // A permanent rejection can follow the same attempt's earlier native failure.
        if (!retryable && attempted) blocked = true
        if (!inFlight) return
        val now = clock()
        if (healthySince?.let { now - it >= STABLE_NANOS } == true) failures = 0
        val delay = DELAYS_MS[failures.coerceAtMost(DELAYS_MS.lastIndex)]
        failures = (failures + 1).coerceAtMost(DELAYS_MS.size)
        inFlight = false; healthySince = null; blocked = !retryable
        retryAt = now + delay * 1_000_000L
    }

    fun reset() {
        failures = 0; retryAt = null; healthySince = null
        inFlight = false; attempted = false; blocked = false
    }

    private companion object {
        val DELAYS_MS = longArrayOf(5_000, 10_000, 20_000, 30_000)
        const val STABLE_NANOS = 60_000_000_000L
    }
}
