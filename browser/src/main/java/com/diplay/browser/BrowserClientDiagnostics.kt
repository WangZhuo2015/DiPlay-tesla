package com.diplay.browser

import org.json.JSONObject

/** Only bounded state/counters, never URLs, error messages, SDP or media payloads. */
internal object BrowserClientDiagnostics {
    private val label = Regex("[A-Za-z][A-Za-z0-9_-]{0,47}")
    private val fields = ("visibility focused renderer transport paused readyState currentTime elementHidden streamActive " +
        "reason errorName request httpStatus durationMs connected statusAvailable hadSocket wasDisplayed connection ice " +
        "decodedFrames decodedFps presentedFrames presentedFps callbackAgeMs callbackPendingMs submittedFrameAgeMs " +
        "sent received expiredFrames overflowFrames keyframeSkips sendFailures recovering fallbackReason " +
        "enabled contextState engine queuedMs underruns overruns rvfc browser persisted dropped " +
        "targetMs packets maxArrivalGapMs musicMaxGapMs navigationMaxGapMs musicQueuedMs navigationQueuedMs musicUnderruns navigationUnderruns").split(' ').toSet()

    fun lines(body: JSONObject): List<String> {
        val client = body.getString("client")
        require(Regex("[a-f0-9]{8}").matches(client))
        val events = body.getJSONArray("events")
        require(events.length() in 1..8)
        val dropped = integer(body, "dropped")
        val lines = mutableListOf<String>()
        if (dropped > 0) lines.add("Browser client=$client dropped=$dropped")
        repeat(events.length()) { index ->
            val event = events.getJSONObject(index)
            val name = event.getString("event")
            require(label.matches(name))
            val seq = integer(event, "seq")
            val time = integer(event, "atMs")
            val elapsed = integer(event, "elapsedMs")
            val data = event.getJSONObject("data")
            require(data.length() <= fields.size)
            for (key in data.keys()) {
                require(key in fields)
                val value = data.get(key)
                require(value == JSONObject.NULL || value is Boolean ||
                    value is Number && value.toDouble().isFinite() && kotlin.math.abs(value.toDouble()) <= 9_007_199_254_740_991.0 ||
                    value is String && label.matches(value))
            }
            val prefix = "Browser client=$client seq=$seq atMs=$time elapsedMs=$elapsed event=$name"
            // The shared history redactor bounds each line to 700 characters.
            var parts = JSONObject()
            for (key in data.keys()) {
                parts.put(key, data.get(key))
                if (parts.toString().length > 450) {
                    parts.remove(key)
                    lines.add("$prefix data=$parts")
                    parts = JSONObject()
                    parts.put(key, data.get(key))
                }
            }
            lines.add("$prefix data=$parts")
        }
        return lines
    }

    private fun integer(value: JSONObject, key: String): Long {
        val number = value.get(key)
        require(number is Number && number.toDouble().isFinite() &&
            number.toDouble() >= 0 && number.toDouble() <= 9_007_199_254_740_991.0 &&
            number.toDouble() == number.toLong().toDouble())
        return number.toLong()
    }
}
