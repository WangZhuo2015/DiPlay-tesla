package com.diplay.browser.rtc

/** Adapted from tepla's queue policy: a gap invalidates all predictive frames. Caller locks. */
internal class RtcFrameQueue {
    data class Frame(val bytes: ByteArray, val nanos: Long, val queued: Long, val key: Boolean)
    private val frames = ArrayDeque<Frame>()
    var needsKey = true; private set
    val size get() = frames.size
    private var bytes = 0
    fun offer(frame: ByteArray, nanos: Long, key: Boolean, now: Long): Boolean {
        expire(now)
        if (frames.size >= 6 || bytes + frame.size > MAX_BYTES) clear()
        if (frame.size > MAX_BYTES || (needsKey && !key)) return false
        frames.addLast(Frame(frame.copyOf(), nanos, now, key)); bytes += frame.size; needsKey = false
        return true
    }
    fun poll(now: Long): Frame? {
        expire(now)
        return if (frames.isEmpty()) null else frames.removeFirst().also { bytes -= it.bytes.size }
    }
    fun clear() { frames.clear(); bytes = 0; needsKey = true }
    private fun expire(now: Long) { if (frames.firstOrNull()?.let { now - it.queued > 150_000_000 } == true) clear() }
    companion object { private const val MAX_BYTES = 2 * 1024 * 1024 }
}
