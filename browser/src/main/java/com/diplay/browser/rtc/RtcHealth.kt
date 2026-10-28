package com.diplay.browser.rtc

/**
 * Receiver feedback complements local send acceptance; neither is an end-to-end latency measure.
 * Inspired by WheelPlay's recovery policy (4ed353682299, GPL-3.0), with a quiet-source reset.
 * All calls are confined to the RTC worker and use one monotonic clock.
 */
internal class RtcHealth(
    private val started: Long,
    private val policy: RtcRecoveryPolicy = RtcRecoveryPolicy.BALANCED,
) {
    private var played = false
    private var heartbeat = started
    private var lastSent: Long? = null
    private var sent = 0L
    private var sentAtProgress = 0L
    private var decoded = -1L
    private var stalledSince: Long? = null
    private var disconnectedSince: Long? = null
    private var blockedSince: Long? = null

    fun ready(now: Long) {
        if (!played) { played = true; stalledSince = null; sentAtProgress = sent }
        heartbeat = now
    }

    fun sent(now: Long) {
        if (lastSent?.let { now - it >= SOURCE_QUIET_NS } != false || sent == sentAtProgress) {
            stalledSince = now
        }
        sent++
        lastSent = now
        blockedSince = null
    }

    fun feedback(frames: Long, now: Long) {
        heartbeat = now
        // Counter decreases can occur when a receiver replaces its inbound RTP report.
        if (frames != decoded) {
            decoded = frames; stalledSince = null; sentAtProgress = sent
        }
        if (!sourceActive(now)) stalledSince = null
    }

    fun disconnected(now: Long) {
        if (disconnectedSince == null) disconnectedSince = now
    }

    fun connected(now: Long) {
        // Transport reconnection alone does not prove a congested local sender recovered.
        // Only a successful send clears blockedSince.
        disconnectedSince = null; stalledSince = null
        lastSent = null; sentAtProgress = sent; heartbeat = now
    }

    fun sendFailed(now: Long) {
        // Queue-loss notifications may predate a native send failure observed by this worker.
        blockedSince = blockedSince?.let { minOf(it, now) } ?: now
    }

    fun needsKeyframe(now: Long) = disconnectedSince == null &&
        (blockedSince != null || (sourceActive(now) && stalledSince?.let { now - it >= KEYFRAME_DELAY_NS } == true))

    fun recovering(now: Long) = disconnectedSince != null || blockedSince != null ||
        (played && now - heartbeat >= KEYFRAME_DELAY_NS) ||
        (sourceActive(now) && stalledSince?.let { now - it >= KEYFRAME_DELAY_NS } == true)

    fun failureReason(now: Long): String? = when {
        !played && now - started >= policy.firstFrameNanos -> "first-frame-timeout"
        disconnectedSince?.let { now - it >= policy.graceNanos } == true -> "disconnected-timeout"
        blockedSince?.let { now - it >= policy.graceNanos } == true -> "send-timeout"
        played && disconnectedSince == null && now - heartbeat >= policy.graceNanos -> "receiver-feedback-timeout"
        played && sourceActive(now) && stalledSince?.let { now - it >= policy.graceNanos } == true -> "decoder-stall"
        else -> null
    }

    fun expired(now: Long) = failureReason(now) != null

    private fun sourceActive(now: Long) = sent > sentAtProgress &&
        lastSent?.let { now - it < SOURCE_QUIET_NS } == true

    companion object {
        private const val SOURCE_QUIET_NS = 2_000_000_000L
        private const val KEYFRAME_DELAY_NS = 2_000_000_000L
    }
}
