package com.diplay.browser

/** One immutable frame: slow clients never accumulate a queue of stale pictures. */
class LatestFrame {
    data class Frame(val sequence: Long, val jpeg: ByteArray)
    private var sequence = 0L
    private var frame: Frame? = null
    @Synchronized fun publish(jpeg: ByteArray) {
        frame = Frame(++sequence, jpeg)
    }
    @Synchronized fun after(previous: Long): Frame? = frame?.takeIf { it.sequence > previous }
    @Synchronized fun clear() { frame = null; sequence++ }
}
