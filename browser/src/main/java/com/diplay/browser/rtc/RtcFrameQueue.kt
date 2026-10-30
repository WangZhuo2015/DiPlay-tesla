package com.diplay.browser.rtc

/**
 * A gap invalidates the entire predictive chain. Caller holds the media queue lock.
 * Queue/recovery policy adapted from fython/wheelplay, commit 4ed353682299 (GPL-3.0).
 */
internal class RtcFrameQueue {
    data class Frame(val bytes: ByteArray, val nanos: Long, val queued: Long, val key: Boolean, val cost: Int)
    private val frames = ArrayDeque<Frame>()
    private var waitingSince: Long? = null
    private var lastOffered: Long? = null
    private var pendingSendFailureSince: Long? = null
    var needsKey = true; private set
    val size get() = frames.size
    var bytes = 0; private set
    var expiredFrames = 0L; private set
    var overflowFrames = 0L; private set
    var keyframeSkips = 0L; private set
    var invalidatedFrames = 0L; private set

    fun offer(frame: ByteArray, nanos: Long, key: Boolean, now: Long, extraBytes: Int = 0): Boolean =
        offer(frame.size, nanos, key, now, extraBytes) { frame.copyOf() }

    /** copyFrame runs only after admission, and must return bytes owned exclusively by this queue. */
    fun offer(size: Int, nanos: Long, key: Boolean, now: Long, extraBytes: Int = 0,
              copyFrame: () -> ByteArray): Boolean {
        require(size >= 0)
        require(extraBytes >= 0)
        // A still screen's idle time is not active keyframe recovery time.
        if (lastOffered?.let { now - it >= SOURCE_QUIET_NS } == true) waitingSince = null
        lastOffered = now
        expire(now)
        val cost = size.toLong() + extraBytes
        if (cost > MAX_BYTES) {
            overflowFrames += frames.size + 1L
            markSendFailure(now)
            dropChain(now)
            return false
        }
        if (frames.size >= MAX_FRAMES || cost > MAX_BYTES - bytes) {
            overflowFrames += frames.size
            markSendFailure(now)
            dropChain(now)
        }
        if (needsKey && !key) {
            if (waitingSince == null) waitingSince = now
            keyframeSkips++
            return false
        }
        frames.addLast(Frame(copyFrame(), nanos, now, key, cost.toInt()))
        bytes += cost.toInt(); needsKey = false; waitingSince = null
        return true
    }

    fun poll(now: Long): Frame? {
        expire(now)
        return if (frames.isEmpty()) null else frames.removeFirst().also { bytes -= it.cost }
    }

    /**
     * The RTC worker consumes local loss separately from keyframe availability. Accepting another
     * keyframe is not proof of recovery: it may also expire before native send accepts it.
     */
    fun takeSendFailure(): Long? = pendingSendFailureSince.also { pendingSendFailureSince = null }

    fun recovering(now: Long) = needsKey && waitingSince != null &&
        lastOffered?.let { now - it < SOURCE_QUIET_NS } == true

    fun recoveryExpired(now: Long, graceNanos: Long) = recovering(now) &&
        waitingSince?.let { now - it >= graceNanos } == true

    /** Invalidating a sent reference also makes every queued dependent frame unusable. */
    fun invalidate(now: Long) {
        invalidatedFrames += frames.size
        dropChain(now)
    }

    /** Session/connection changes discard old recovery timers without resetting diagnostics. */
    fun clear() {
        frames.clear(); bytes = 0; needsKey = true; waitingSince = null; lastOffered = null
        pendingSendFailureSince = null
    }

    fun reset() {
        clear(); expiredFrames = 0; overflowFrames = 0; keyframeSkips = 0; invalidatedFrames = 0
    }

    private fun dropChain(now: Long) {
        frames.clear(); bytes = 0; needsKey = true
        if (waitingSince == null) waitingSince = now
    }

    private fun expire(now: Long) {
        if (frames.firstOrNull()?.let { now - it.queued >= MAX_AGE_NS } == true) {
            expiredFrames += frames.size
            markSendFailure(now)
            dropChain(now)
        }
    }

    private fun markSendFailure(now: Long) {
        if (pendingSendFailureSince == null) pendingSendFailureSince = now
    }

    companion object {
        const val MAX_AGE_NS = 50_000_000L
        const val MAX_BYTES = 2 * 1024 * 1024
        const val MAX_FRAMES = 6
        private const val SOURCE_QUIET_NS = 2_000_000_000L
    }
}
