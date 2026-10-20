package com.diplay.browser.rtc

/** Recovery waiting time, independent of the fixed 50 ms compressed-frame queue budget. */
enum class RtcRecoveryPolicy(val graceMs: Long) {
    QUICK(4_000), BALANCED(10_000), PATIENT(30_000);

    val graceNanos get() = graceMs * 1_000_000
    val firstFrameNanos get() = maxOf(10_000L, graceMs) * 1_000_000

    companion object {
        fun fromMillis(value: Long) = entries.firstOrNull { it.graceMs == value } ?: BALANCED
    }
}
