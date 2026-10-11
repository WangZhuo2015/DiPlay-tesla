package com.diplay.browser

import com.shilapi.xcertplay.airplay.AirPlayContact
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.net.ServerSocket
import java.net.Socket

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29])
class BrowserServerTest {
    @Test fun authenticatedBrowserCanControlWhileInvalidRequestsAndCrossOriginsAreRejected() {
        val port = ServerSocket(0).use { it.localPort }
        val token = "1234567890abcdef1234567890abcdef"
        val frames = LatestFrame()
        var selected = BrowserDisplay()
        var touches = 0
        val target = object : BrowserTarget {
            override fun status() = JSONObject().put("display", BrowserDisplayJson.encode(selected))
            override fun touch(contacts: List<AirPlayContact>): Boolean { touches++; return true }
            override fun action(name: String) = true
            override fun saveDisplay(display: BrowserDisplay) { selected = display }
        }
        val pairing = BrowserPairing(nextCode = { 123456 })
        pairing.begin()
        val server = BrowserServer(port, RuntimeEnvironment.getApplication().assets, token, frames, target, pairing = pairing)
        server.start(2000, true)
        try {
            fun request(path: String, auth: Boolean = true, body: String? = null, origin: String? = null): Pair<Int, ByteArray> {
                // Use the wire directly: HttpURLConnection silently removes the Origin header.
                return Socket("127.0.0.1", port).use { socket ->
                    socket.soTimeout = 2000
                    val payload = body?.toByteArray(Charsets.UTF_8)
                    val headers = buildString {
                        append("${if (body == null) "GET" else "POST"} $path HTTP/1.1\r\nHost: 127.0.0.1:$port\r\nConnection: close\r\n")
                        if (auth) append("Authorization: Bearer $token\r\n")
                        if (origin != null) append("Origin: $origin\r\n")
                        if (payload != null) append("Content-Type: application/json\r\nContent-Length: ${payload.size}\r\n")
                        append("\r\n")
                    }
                    socket.getOutputStream().apply {
                        write(headers.toByteArray(Charsets.US_ASCII))
                        payload?.let(::write)
                        flush()
                    }
                    val input = socket.getInputStream().buffered()
                    val responseHeaders = StringBuilder()
                    while (!responseHeaders.endsWith("\r\n\r\n")) {
                        val next = input.read()
                        check(next >= 0 && responseHeaders.length < 8192)
                        responseHeaders.append(next.toChar())
                    }
                    responseHeaders.toString().substringBefore("\r\n").split(' ')[1].toInt() to input.readBytes()
                }
            }
            val presets = request("/display-presets.js", auth = false)
            assertEquals(200, presets.first)
            assertTrue(String(presets.second).contains("export function displayPreset"))
            for (asset in listOf("browser-touch.js", "stream-summary.js")) {
                assertEquals(200, request("/$asset", auth = false).first)
            }
            assertEquals(401, request("/api/status",auth = false).first)
            assertEquals(405, request("/api/pair", auth = false).first)
            repeat(5) {
                assertEquals(403, request("/api/pair", auth = false, body = """{"code":"123456"}""", origin = "http://elsewhere").first)
            }
            val rejected = request("/api/pair", auth = false, body = """{"code":"999999"}""")
            assertEquals(401, rejected.first)
            assertFalse(String(rejected.second).contains(token))
            val paired = request("/api/pair", auth = false, body = """{"code":"123456"}""", origin = "http://127.0.0.1:$port")
            assertEquals(200, paired.first)
            assertEquals(token, JSONObject(String(paired.second)).getString("token"))
            assertEquals(401, request("/api/status", auth = false).first)
            assertEquals(403, request("/api/status",origin = "http://elsewhere").first)
            assertEquals(200, request("/api/status").first)
            assertEquals(204, request("/api/frame").first)
            frames.publish(byteArrayOf(1,2,3))
            assertArrayEquals(byteArrayOf(1,2,3),request("/api/frame").second)
            assertEquals(204,request("/api/frame?after=1").first)
            assertEquals(400,request("/api/display",body = "{}").first)
            assertEquals(0,touches)
            val full = BrowserDisplay(mode = BrowserMode.FULL, full = BrowserResolution(1600,900))
            assertEquals(200,request("/api/display",body = BrowserDisplayJson.encode(full).toString()).first)
            assertEquals(full,selected)
            assertEquals(200,request("/api/touch",body = """{"client":"client-one","contacts":[{"id":0,"x":0.5,"y":0.25,"down":true}]}""").first)
            assertEquals(409,request("/api/touch",body = """{"client":"client-two","contacts":[{"id":0,"x":0.5,"y":0.25,"down":true}]}""").first)
            assertEquals(200,request("/api/touch",body = """{"client":"client-one","contacts":[{"id":0,"x":0.5,"y":0.25,"down":false}]}""").first)
            assertEquals(200,request("/api/touch",body = """{"client":"client-two","contacts":[{"id":0,"x":0.5,"y":0.25,"down":true}]}""").first)
            assertEquals(200,request("/api/touch",body = """{"client":"client-two","contacts":[]}""").first)
        } finally { server.close() }
    }
}
