package com.diplay.browser.rtc

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class) @Config(sdk = [29])
class RtcDiagnosticSummaryTest {
    @Test fun signalingRetainsCandidateShapeWithoutAddressesOrIceCredentials() {
        val summary = RtcDiagnosticSummary.signaling("a=ice-pwd:private-secret\r\n" +
            "a=rtpmap:96 H265/90000\r\na=candidate:1 1 UDP 1 7.7.7.1 40001 typ host\r\n" +
            "a=candidate:2 1 UDP 2 personal-id.local 40002 typ host\r\n")
        assertTrue(summary.contains("hevc=true candidates=2 host=2"))
        assertTrue(summary.contains("mdns=1"))
        for (secret in listOf("private-secret", "7.7.7.1", "personal-id", "40001")) assertFalse(summary.contains(secret))
    }
    @Test fun feedbackOnlyExportsBoundedCountersAndEnumeratedStates() {
        val data = JSONObject().put("decoded", 10).put("bytesReceived", 8000L).put("width", 1920)
            .put("height", -1).put("dropped", "password=secret").put("connection", "private-secret")
            .put("ice", "checking").put("remoteFamily", "ipv4").put("rawSdp", "credentials")
        val summary = RtcDiagnosticSummary.feedback(data)
        assertTrue(summary.contains("decoded=10 dropped=unknown bytes=8000"))
        assertTrue(summary.contains("size=1920xunknown connection=unknown ice=checking"))
        assertFalse(summary.contains("secret")); assertFalse(summary.contains("credentials"))
    }
}
