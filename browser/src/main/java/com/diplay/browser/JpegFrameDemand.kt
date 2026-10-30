package com.diplay.browser

import java.util.concurrent.atomic.AtomicBoolean

/**
 * Preserve one real decoded-frame proof per stream before sleeping. Wireless peers
 * without the optional iAP2 tunnel use that proof to retain their Bluetooth control
 * connection; receipt of a compressed packet alone is not sufficient evidence.
 */
internal class JpegFrameDemand(private val frames: LatestFrame) {
    private val startup = AtomicBoolean(true)
    fun needed(): Boolean = startup.get() || frames.hasDemand()
    fun published(): Boolean = startup.compareAndSet(true, false)
    fun reset() { startup.set(true) }
}
