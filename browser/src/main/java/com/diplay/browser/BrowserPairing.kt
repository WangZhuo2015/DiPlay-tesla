package com.diplay.browser

import java.security.MessageDigest
import java.security.SecureRandom

/** A bounded, owner-opened pairing window exchanges a short code for the existing session token. */
class BrowserPairing(
    private val nowMillis: () -> Long = { System.nanoTime() / 1_000_000 },
    private val nextCode: () -> Int = { SecureRandom().nextInt(1_000_000) },
) {
    private var code: String? = null
    private var openedAt = 0L
    private var failedAttempts = 0

    @Synchronized fun begin(): String {
        val value = nextCode()
        require(value in 0..999_999)
        return value.toString().padStart(6, '0').also {
            code = it; openedAt = nowMillis(); failedAttempts = 0
        }
    }

    @Synchronized fun accept(candidate: String): Boolean {
        val expected = code ?: return false
        if (nowMillis() - openedAt !in 0 until WINDOW_MILLIS || failedAttempts >= MAX_ATTEMPTS) return false
        val matches = candidate.matches(Regex("[0-9]{6}")) && MessageDigest.isEqual(
            candidate.toByteArray(Charsets.US_ASCII), expected.toByteArray(Charsets.US_ASCII))
        if (!matches) failedAttempts++
        return matches
    }

    companion object {
        private const val WINDOW_MILLIS = 5 * 60 * 1000L
        private const val MAX_ATTEMPTS = 5
    }
}
