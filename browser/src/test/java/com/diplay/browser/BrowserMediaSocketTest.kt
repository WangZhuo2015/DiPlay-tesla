package com.diplay.browser

import com.shilapi.xcertplay.airplay.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.InputStream
import java.io.ByteArrayInputStream
import java.lang.reflect.Proxy
import fi.iki.elonen.NanoHTTPD.IHTTPSession
import fi.iki.elonen.NanoWSD.WebSocket
import fi.iki.elonen.NanoWSD.WebSocketFrame
import java.net.ServerSocket
import java.net.Socket
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class) @Config(sdk = [29])
class BrowserMediaSocketTest {
    @Test fun aSecondPageWaitsWithoutStealingMediaAndJoinsWhenTheOwnerLeaves() {
        val port = ServerSocket(0).use { it.localPort }
        val token = "1234567890abcdef1234567890abcdef"
        val media = BrowserMediaHub()
        val owner = Any()
        assertTrue(media.attach(owner, false, { true }, { _, _ -> true }))
        media.audio.ready(owner, true)
        val target = object : BrowserTarget {
            override fun status() = JSONObject()
            override fun touch(contacts: List<AirPlayContact>) = true
            override fun action(name: String) = true
            override fun saveDisplay(display: BrowserDisplay) {}
        }
        val server = BrowserServer(port, RuntimeEnvironment.getApplication().assets, token, LatestFrame(), target, media)
        server.start(2000, true)
        try {
            Socket("127.0.0.1", port).use { socket ->
                socket.soTimeout = 2000
                socket.getOutputStream().write(("GET /api/media HTTP/1.1\r\nHost: 127.0.0.1:$port\r\n" +
                    "Origin: http://127.0.0.1:$port\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n" +
                    "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n").toByteArray())
                val input = socket.getInputStream()
                val headers = StringBuilder()
                while (!headers.endsWith("\r\n\r\n")) { val c = input.read(); check(c >= 0); headers.append(c.toChar()) }
                assertTrue(headers.startsWith("HTTP/1.1 101"))
                fun receive() = JSONObject(frame(input).second.toString(Charsets.UTF_8)).getString("type")
                send(socket, """{"type":"hello","token":"$token","rtc":true}""")
                assertEquals("media-busy", receive())
                send(socket, """{"type":"audio-ready","playback":false}""")
                send(socket, """{"type":"ping"}""")
                assertEquals("media-busy", receive()); assertEquals("pong", receive())
                assertTrue("Waiting page must not mute the owner", media.audio.active)
                media.detach(owner)
                send(socket, """{"type":"ping"}""")
                assertEquals("welcome", receive()); assertEquals("pong", receive())
                send(socket, """{"type":"audio-ready","playback":true}""")
                send(socket, """{"type":"ping"}""")
                assertEquals("pong", receive()); assertTrue(media.audio.active)
            }
        } finally { server.close(); media.detach(owner) }
    }
    @Test fun anEmptyCloseFrameReleasesTheMediaLeaseWithoutNullParameterFailure() {
        val close = WebSocketFrame.read(ByteArrayInputStream(
            byteArrayOf(0x88.toByte(), 0x80.toByte(), 0, 0, 0, 0))) as WebSocketFrame.CloseFrame
        assertNull(close.closeCode)
        assertNull(close.closeReason)
        val input = ByteArrayInputStream(byteArrayOf())
        val handshake = Proxy.newProxyInstance(IHTTPSession::class.java.classLoader,
            arrayOf(IHTTPSession::class.java)) { _, method, _ ->
            when (method.name) {
                "getInputStream" -> input
                "getHeaders" -> mapOf("sec-websocket-key" to "dGhlIHNhbXBsZSBub25jZQ==")
                else -> null
            }
        } as IHTTPSession
        val notes = mutableListOf<String>()
        val media = BrowserMediaHub { notes.add(it) }
        var ended = 0
        val socket = BrowserMediaSocket(handshake, "1234567890abcdef1234567890abcdef", media) { ended++ }
        assertTrue(media.attach(socket, false, { true }, { _, _ -> true }))
        media.audio.ready(socket, true)
        assertTrue(media.audio.active)
        // Dispatch through NanoWSD's Java signature: these platform arguments really can be null.
        (socket as WebSocket).close(close.closeCode, close.closeReason, true)
        socket.disconnect()
        assertEquals(1, ended)
        assertEquals(1, notes.count { it.startsWith("Browser socket closed ") })
        assertTrue(notes.any { it.contains("reason=remote-close-empty") && it.contains("pendingAudio=0") })
        assertFalse(media.audio.active)
        val next = Any()
        assertTrue(media.attach(next, false, { true }, { _, _ -> true }))
        media.detach(next)
    }

    @Test fun mediaRequiresOriginAndPairingThenTransportsReadyPcmAndReleasesOwnership() {
        val port = ServerSocket(0).use { it.localPort }
        val token = "1234567890abcdef1234567890abcdef"
        val notes = java.util.Collections.synchronizedList(mutableListOf<String>())
        val windowReset = CountDownLatch(1)
        val ackReset = CountDownLatch(1)
        val media = BrowserMediaHub {
            notes.add(it)
            if (it.startsWith("Browser audio reset reason=audio-window-full ")) windowReset.countDown()
            if (it.startsWith("Browser audio reset reason=audio-ack-timeout ")) ackReset.countDown()
        }
        val target = object : BrowserTarget {
            override fun status() = JSONObject()
            override fun touch(contacts: List<AirPlayContact>) = true
            override fun action(name: String) = true
            override fun saveDisplay(display: BrowserDisplay) {}
        }
        val server = BrowserServer(port, RuntimeEnvironment.getApplication().assets, token, LatestFrame(), target, media)
        server.start(2000, true)
        fun connect(origin: String): Pair<Socket, Int> {
            val socket = Socket("127.0.0.1", port).apply { soTimeout = 2000 }
            socket.getOutputStream().write(("GET /api/media HTTP/1.1\r\nHost: 127.0.0.1:$port\r\n" +
                "Origin: $origin\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n" +
                "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n").toByteArray())
            val headers = StringBuilder()
            val input = socket.getInputStream()
            while (!headers.endsWith("\r\n\r\n")) {
                val next = input.read(); check(next >= 0 && headers.length < 8192); headers.append(next.toChar())
            }
            return socket to headers.toString().substringBefore("\r\n").split(' ')[1].toInt()
        }
        try {
            connect("http://elsewhere").let { (socket, status) -> socket.use { assertEquals(403, status) } }
            connect("http://127.0.0.1:$port").let { (socket, status) -> socket.use {
                assertEquals(101, status)
                send(it, """{"type":"hello","token":"wrong","rtc":false}""")
                assertEquals(-1, it.getInputStream().read())
                assertFalse(media.audio.active)
            } }
            connect("http://127.0.0.1:$port").let { (socket, status) -> socket.use {
                assertEquals(101, status)
                send(it, """{"type":"hello","token":"$token","rtc":false}""")
                assertEquals("welcome", JSONObject(frame(it.getInputStream()).second.toString(Charsets.UTF_8)).getString("type"))
                send(it, """{"type":"audio-ready","playback":true}""")
                send(it, """{"type":"ping"}""")
                assertEquals("pong", JSONObject(frame(it.getInputStream()).second.toString(Charsets.UTF_8)).getString("type"))
                val pcm = byteArrayOf(1, 2, 3, 4)
                assertTrue(media.audio.offer(AudioStreamId(100,"media"), AudioFormat(AudioCodecKind.LPCM,44100,2,100), pcm,0,pcm.size))
                val (opcode, packet) = frame(it.getInputStream())
                assertEquals(2, opcode)
                val header = ByteBuffer.wrap(packet).order(ByteOrder.LITTLE_ENDIAN)
                assertEquals(0x31415057, header.int); header.int
                assertEquals(44100, header.int); assertEquals(2, header.short.toInt()); header.short
                val sequence = header.int.toLong() and 0xffff_ffffL
                assertArrayEquals(pcm, packet.copyOfRange(20,packet.size))
                send(it, """{"type":"audio-ack","sequence":$sequence}""")
                send(it, """{"type":"audio-ready","playback":false}""")
                send(it, """{"type":"ping"}""")
                assertEquals("pong", JSONObject(frame(it.getInputStream()).second.toString(Charsets.UTF_8)).getString("type"))
                assertFalse(media.audio.active)
                it.getOutputStream().apply { write(byteArrayOf(0x88.toByte(), 0x80.toByte(), 0, 0, 0, 0)); flush() }
                assertEquals(-1, it.getInputStream().read())
            } }
            connect("http://127.0.0.1:$port").let { (socket, status) -> socket.use {
                assertEquals(101, status)
                send(it, """{"type":"hello","token":"$token","rtc":true}""")
                assertEquals("welcome", JSONObject(frame(it.getInputStream()).second.toString(Charsets.UTF_8)).getString("type"))
                send(it, """{"type":"audio-ready","playback":true}""")
                send(it, """{"type":"ping"}""")
                assertEquals("pong", JSONObject(frame(it.getInputStream()).second.toString(Charsets.UTF_8)).getString("type"))
                notes.clear()
                val pcm = byteArrayOf(1, 2, 3, 4)
                val id = AudioStreamId(100, "media")
                val format = AudioFormat(AudioCodecKind.LPCM, 44100, 2, 100)
                repeat(24) { assertTrue(media.audio.offer(id, format, pcm, 0, pcm.size)) }
                assertTrue("Overload must stay on the browser route, not grab Android audio focus",
                    media.audio.offer(id, format, pcm, 0, pcm.size))
                assertTrue(windowReset.await(2, TimeUnit.SECONDS))
                fun receiveStop(): Int {
                    repeat(32) {
                        val (opcode, payload) = frame(socket.getInputStream())
                        if (opcode == 1) {
                            val message = JSONObject(payload.toString(Charsets.UTF_8))
                            if (message.getString("type") == "audio-stop") return message.getInt("stream")
                        }
                    }
                    error("Audio recovery did not stop stale playback")
                }
                val oldStream = receiveStop()
                assertTrue(media.viewerAttached)
                assertTrue(media.audio.active)
                assertTrue(notes.none { line -> line == "Browser media detached" })
                assertTrue(media.audio.offer(id, format, pcm, 0, pcm.size))
                val (opcode, packet) = frame(socket.getInputStream())
                assertEquals(2, opcode)
                assertNotEquals(oldStream, ByteBuffer.wrap(packet).order(ByteOrder.LITTLE_ENDIAN).getInt(4))
                assertArrayEquals(pcm, packet.copyOfRange(20, packet.size))
                // Deliberately leave this packet unacknowledged: expiry must also recover audio only.
                assertTrue(ackReset.await(2, TimeUnit.SECONDS))
                receiveStop()
                send(socket, """{"type":"ping"}""")
                assertEquals("pong", JSONObject(frame(socket.getInputStream()).second.toString(Charsets.UTF_8)).getString("type"))
                assertTrue(media.viewerAttached)
                assertTrue(media.audio.active)
                assertTrue(notes.none { line -> line == "Browser media detached" })
                assertTrue(notes.none { line -> line.startsWith("Browser socket closed ") &&
                    (line.contains("audio-window-full") || line.contains("audio-ack-timeout")) })
            } }
        } finally { server.close() }
    }
    private fun send(socket: Socket, text: String) {
        val bytes = text.toByteArray(); require(bytes.size < 126)
        val mask = byteArrayOf(1,2,3,4)
        socket.getOutputStream().apply {
            write(byteArrayOf(0x81.toByte(), (0x80 or bytes.size).toByte())); write(mask)
            write(bytes.mapIndexed { index, byte -> (byte.toInt() xor mask[index % 4].toInt()).toByte() }.toByteArray()); flush()
        }
    }
    private fun frame(input: InputStream): Pair<Int, ByteArray> {
        val opcode = input.read() and 15; var size = input.read(); check(size in 0..127)
        if (size == 126) size = input.read() * 256 + input.read()
        check(size in 0..65535)
        val payload = ByteArray(size); var offset = 0
        while (offset < size) { val count=input.read(payload,offset,size-offset); check(count>0); offset+=count }
        return opcode to payload
    }
}
