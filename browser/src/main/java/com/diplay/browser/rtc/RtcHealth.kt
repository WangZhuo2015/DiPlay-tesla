package com.diplay.browser.rtc

/** A quiet source is healthy while the viewer keeps acknowledging its current decoded count. */
internal class RtcHealth(private val started: Long) {
    private var played = false
    private var heartbeat = started
    private var progressed = started
    private var sent = Long.MIN_VALUE
    private var decoded = -1L
    fun ready(now: Long) { played = true; heartbeat = now; progressed = now }
    fun sent(now: Long) { sent = now }
    fun feedback(frames: Long, now: Long) {
        heartbeat = now
        if (frames > decoded) { decoded = frames; progressed = now }
    }
    fun expired(now: Long): Boolean = if (!played) now - started > 10_000_000_000L else
        now - heartbeat > 4_000_000_000L ||
            (sent != Long.MIN_VALUE && now - progressed > 5_000_000_000L && now - sent < 2_000_000_000L)
}
