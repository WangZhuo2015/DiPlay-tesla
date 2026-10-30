package com.diplay.browser

/** One immutable frame: slow clients never accumulate a queue of stale pictures. */
class LatestFrame(private val clock: () -> Long = System::nanoTime) {
    data class Frame(val sequence: Long, val jpeg: ByteArray)
    private var sequence = 0L
    private var frame: Frame? = null
    private var requestedAt: Long? = null
    /** Only authenticated JPEG requests renew this lease; inspecting a frame does not. */
    @Synchronized fun request() { requestedAt = clock() }
    @Synchronized fun hasDemand(): Boolean = requestedAt?.let {
        clock() - it in 0 until DEMAND_NS
    } == true
    @Synchronized fun publish(jpeg: ByteArray) {
        frame = Frame(++sequence, jpeg)
    }
    @Synchronized fun after(previous: Long): Frame? = frame?.takeIf { it.sequence > previous }
    @Synchronized fun clear() { frame = null; sequence++ }
    companion object {
        private const val DEMAND_NS = 2_000_000_000L
    }
}
