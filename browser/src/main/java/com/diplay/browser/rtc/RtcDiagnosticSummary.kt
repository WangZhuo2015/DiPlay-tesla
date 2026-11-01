package com.diplay.browser.rtc

import org.json.JSONObject

/** Only fixed labels and bounded counters survive. Never retains SDP, ICE credentials or client text. */
internal object RtcDiagnosticSummary {
    fun signaling(sdp: String): String {
        val candidates = sdp.lineSequence().filter { it.startsWith("a=candidate:") }.map { it.trim().split(' ') }.toList()
        val kinds = candidates.map { it.getOrNull(7) }.filter { it in setOf("host", "srflx", "prflx", "relay") }
        return "h264=${sdp.contains(" H264/", true)} hevc=${sdp.contains(" H265/", true)} " +
            "candidates=${candidates.size} host=${kinds.count { it == "host" }} relay=${kinds.count { it == "relay" }} " +
            "mdns=${candidates.count { it.getOrNull(4)?.endsWith(".local") == true }} " +
            "ipv6=${candidates.count { it.getOrNull(4)?.contains(':') == true }}"
    }

    fun feedback(data: JSONObject): String {
        fun count(key: String, max: Long = 9_007_199_254_740_991L): String {
            val value = data.opt(key)
            return if ((value is Int || value is Long) && (value as Number).toLong() in 0..max)
                value.toString() else "unknown"
        }
        fun label(key: String, allowed: Set<String>): String = (data.opt(key) as? String)?.takeIf { it in allowed } ?: "unknown"
        return "decoded=${count("decoded")} dropped=${count("dropped")} bytes=${count("bytesReceived")} " +
            "packets=${count("packetsReceived")} size=${count("width", 16384)}x${count("height", 16384)} " +
            "connection=${label("connection", setOf("new", "connecting", "connected", "disconnected", "failed", "closed"))} " +
            "ice=${label("ice", setOf("new", "checking", "connected", "completed", "disconnected", "failed", "closed"))} " +
            "remoteKind=${label("remoteKind", setOf("host", "srflx", "prflx", "relay"))} " +
            "remoteFamily=${label("remoteFamily", setOf("ipv4", "ipv6", "mdns"))}"
    }
}
