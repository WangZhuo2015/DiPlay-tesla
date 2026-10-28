package com.shilapi.xcertplay.airplay

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Adapted from WheelPlay 7f5da986; the existing DiPlay bounded RTSP parser is retained. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29])
class AirPlaySessionSecurityTest {
    @Test fun unauthenticatedCommandsCannotReachListenersOrMediaIncludingBootstrapPaths() {
        val fixture = Fixture(Socket())
        try {
            val commands = listOf("SETUP" to "/", "RECORD" to "/", "TEARDOWN" to "/",
                "POST" to "/command", "POST" to "/feedback", "SET_PARAMETER" to "/",
                "SETUP" to "/info", "RECORD" to "/pair-verify", "GET" to "/pair-verify",
                "SETRATE" to "/", "SETRATEANCHORTIME" to "/", "GETANCHOR" to "/", "FLUSHBUFFERED" to "/")
            for ((method, path) in commands) {
                assertEquals("$method $path", 401, fixture.handle(method, path).status)
            }
            assertEquals(0, fixture.callbacks)
            assertNull(fixture.session.controllerId)
            assertNull(fixture.session.sharedSecret)
        } finally { fixture.session.close() }
    }

    @Test fun discoveryAndPairingRemainAvailableBeforeVerification() {
        val fixture = Fixture(Socket())
        try {
            assertEquals(200, fixture.handle("OPTIONS", "*").status)
            assertTrue((BplistCodec.decode(fixture.handle("GET", "/info").body) as Map<*, *>).containsKey("features"))
            assertNotNull(Tlv8Codec.decode(fixture.handle("POST", "/pair-setup").body)[6])
            // Missing MFi credentials are still reported by auth-setup, not by the auth gate.
            assertEquals(400, fixture.handle("POST", "/auth-setup").status)
        } finally { fixture.session.close() }
    }

    @Test fun ephemeralExchangeAndInvalidSignatureDoNotAuthenticateOrExposeMediaKeys() {
        val fixture = Fixture(Socket())
        try {
            val peer = AirPlayVerifyTestPeer(fixture.pairings)
            peer.receiveM2(fixture.handle("POST", "/pair-verify", peer.m1()).body)
            assertNull(fixture.session.sharedSecret)
            assertEquals(401, fixture.handle("RECORD", "/").status)
            val response = fixture.handle("POST", "/pair-verify", peer.m3(validSignature = false))
            assertNotNull(Tlv8Codec.decode(response.body)[7])
            assertFalse(fixture.session.pairVerify.isVerified)
            assertNull(fixture.session.pairVerify.controlKeys)
            assertNull(fixture.session.sharedSecret)
            assertEquals(401, fixture.handle("POST", "/command").status)
            assertEquals(0, fixture.callbacks)
        } finally { fixture.session.close() }
    }

    @Test fun verifiedControllerCanActivateAndSetUpStreamsButCannotRekeyActiveSession() {
        val fixture = Fixture(Socket())
        try {
            val peer = AirPlayVerifyTestPeer(fixture.pairings)
            peer.receiveM2(fixture.handle("POST", "/pair-verify", peer.m1()).body)
            assertNull(Tlv8Codec.decode(fixture.handle("POST", "/pair-verify", peer.m3()).body)[7])
            assertEquals(peer.identifier, fixture.session.controllerId)
            assertArrayEquals(peer.shared, fixture.session.sharedSecret)
            assertEquals(200, fixture.handle("RECORD", "/").status)
            val streams = BplistCodec.encode(mapOf("streams" to listOf(mapOf("type" to 110))))
            val response = fixture.handle("SETUP", "/", streams)
            assertEquals(12345L, (((BplistCodec.decode(response.body) as Map<*, *>)["streams"] as List<*>)[0] as Map<*, *>)["dataPort"])
            assertEquals(2, fixture.callbacks)
            assertEquals(400, fixture.handle("POST", "/pair-verify", peer.m1()).status)
            assertEquals(400, fixture.handle("POST", "/pair-setup", peer.m1()).status)
            assertArrayEquals(peer.shared, fixture.session.sharedSecret)
        } finally { fixture.session.close() }
    }

    @Test fun verifiedMediaSecretIsADefensiveCopy() {
        val fixture = Fixture(Socket())
        try {
            val peer = fixture.session.verifyForTest()
            val exposed = fixture.session.pairVerify.shared!!
            exposed[0] = (exposed[0].toInt() xor 1).toByte()
            assertArrayEquals(peer.shared, fixture.session.sharedSecret)
        } finally { fixture.session.close() }
    }

    @Test fun eventChannelRefusesAnEphemeralSecretWithoutCompletedVerification() {
        val fixture = Fixture(Socket())
        try {
            val peer = AirPlayVerifyTestPeer(fixture.pairings)
            peer.receiveM2(fixture.handle("POST", "/pair-verify", peer.m1()).body)
            val port = AirPlaySession::class.java.getDeclaredMethod("openEvent")
                .apply { isAccessible = true }.invoke(fixture.session) as Int
            Socket(InetAddress.getLoopbackAddress(), port).use {
                assertTrue(fixture.ended.await(3, TimeUnit.SECONDS))
                assertNull(fixture.session.sharedSecret)
                assertEquals(0, fixture.callbacks)
            }
        } finally { fixture.session.close() }
    }

    @Test fun restartingOrFailingStandaloneVerificationClearsPreviouslyDerivedState() {
        val identity = AirPlayIdentity.generate()
        val pairings = PairingStore()
        val verify = PairVerify(identity, pairings)
        val peer = AirPlayVerifyTestPeer(pairings)
        peer.receiveM2(verify.handle(peer.m1()))
        verify.handle(peer.m3())
        assertTrue(verify.isVerified)
        verify.handle(peer.m1())
        assertFalse(verify.isVerified)
        assertNull(verify.shared)
        assertNull(verify.controlKeys)
        assertNull(verify.verifiedControllerId)
        verify.handle(byteArrayOf(6, 1, 99))
        assertNull(verify.shared)
        assertNotNull(Tlv8Codec.decode(verify.handle(peer.m3()))[7])
    }

    @Test fun pipelinedPlaintextAfterM3CannotExecuteWithNewlyVerifiedIdentity() {
        val socket = ScriptedSocket()
        val fixture = Fixture(socket)
        val peer = AirPlayVerifyTestPeer(fixture.pairings)
        peer.receiveM2(fixture.handle("POST", "/pair-verify", peer.m1()).body)
        socket.bytes = wire("POST", "/pair-verify", peer.m3()) + wire("RECORD", "/")
        fixture.session.start()
        assertTrue(fixture.ended.await(3, TimeUnit.SECONDS))
        assertTrue(fixture.session.pairVerify.isVerified)
        assertEquals(0, fixture.callbacks)
    }

    @Test fun partialPlaintextCannotBeCompletedByTheNextEncryptedRead() {
        val socket = BatchedSocket()
        val fixture = Fixture(socket)
        val peer = AirPlayVerifyTestPeer(fixture.pairings)
        peer.receiveM2(fixture.handle("POST", "/pair-verify", peer.m1()).body)
        // Without the remainder guard, the old plaintext "REC" would be joined to decrypted
        // "ORD ..." on the next read, dispatching a valid RECORD under the verified identity.
        socket.batches = listOf(wire("POST", "/pair-verify", peer.m3()) + "REC".toByteArray(),
            peer.controlCipher().encrypt("ORD / RTSP/1.0\r\n\r\n".toByteArray()))
        fixture.session.start()
        assertTrue(fixture.ended.await(3, TimeUnit.SECONDS))
        assertTrue(fixture.session.pairVerify.isVerified)
        assertEquals(0, fixture.callbacks)
        assertEquals("The plaintext tail must close the session before the next read", 1, socket.readBatches)
    }

    @Test fun oversizedControlFrameClosesSessionBeforeDispatch() {
        val socket = ScriptedSocket()
        socket.bytes = "SETUP / RTSP/1.0\r\nContent-Length: 1073741824\r\n\r\n".toByteArray()
        val fixture = Fixture(socket)
        fixture.session.start()
        assertTrue(fixture.ended.await(3, TimeUnit.SECONDS))
        assertEquals(0, fixture.callbacks)
    }

    @Test fun realPairVerifyEnablesEncryptedControlAndEventFraming() {
        val loopback = InetAddress.getLoopbackAddress()
        ServerSocket(0, 1, loopback).use { server ->
            Socket(loopback, server.localPort).use { client ->
                client.soTimeout = 5000
                val fixture = Fixture(server.accept())
                fixture.session.start()
                try {
                    client.getOutputStream().write(wire("RECORD", "/"))
                    assertEquals("401", read(client).path)
                    assertEquals(0, fixture.callbacks)
                    assertEquals(0, fixture.setupResponses)
                    val peer = AirPlayVerifyTestPeer(fixture.pairings)
                    client.getOutputStream().write(wire("POST", "/pair-verify", peer.m1()))
                    peer.receiveM2(read(client).body)
                    client.getOutputStream().write(wire("POST", "/pair-verify", peer.m3()))
                    assertNull(Tlv8Codec.decode(read(client).body)[7])
                    val cipher = peer.controlCipher()
                    client.getOutputStream().write(cipher.encrypt(wire("RECORD", "/")))
                    assertEquals("200", read(client, cipher).path)
                    assertEquals(1, fixture.callbacks)
                    client.getOutputStream().write(cipher.encrypt(wire("SETUP", "/", BplistCodec.encode(emptyMap<String, Any>()))))
                    val ports = BplistCodec.decode(read(client, cipher).body) as Map<*, *>
                    Socket(loopback, (ports["eventPort"] as Number).toInt()).use { event ->
                        event.soTimeout = 5000
                        val events = peer.eventCipher()
                        event.getOutputStream().write(events.encrypt(wire("POST", "/event")))
                        assertEquals("200", read(event, events).path)
                        event.getOutputStream().write(events.encrypt("POST /event RTSP/1.0\r\nContent-Length: 1073741824\r\n\r\n".toByteArray()))
                        assertTrue("Malformed event framing must close its session", fixture.ended.await(5, TimeUnit.SECONDS))
                    }
                } finally { fixture.session.close() }
            }
        }
    }

    private class Fixture(socket: Socket) {
        val pairings = PairingStore()
        val ended = CountDownLatch(1)
        @Volatile var callbacks = 0
        @Volatile var setupResponses = 0
        val session = AirPlaySession(socket,
            AirPlayConfig("test", "02:00:00:00:00:02", "02:00:00:00:00:01", "1", AirPlayDisplayConfig(800, 480), mainBufferedAudio = true),
            AirPlayIdentity.generate(), pairings, null,
            object : AirPlaySessionListener {
                override fun onSessionActive(session: AirPlaySession) { callbacks++ }
                override fun onCommand(session: AirPlaySession, type: String, params: Map<String, Any?>) { callbacks++ }
                override fun onDeviceInfo(session: AirPlaySession, info: AirPlayDeviceInfo) { callbacks++ }
                override fun onSessionEnded(session: AirPlaySession) { ended.countDown() }
            },
            object : AirPlayMediaHandler {
                override fun onScreen(session: AirPlaySession, type: Int, stream: Map<String, Any?>): Int { callbacks++; return 12345 }
                override fun onFeedback(session: AirPlaySession): Map<String, Any?>? { callbacks++; return null }
                override fun onBufferedAudioControl(session: AirPlaySession, method: String, body: Map<String, Any?>): Map<String, Any?>? {
                    callbacks++; return null
                }
                override fun onTeardown(session: AirPlaySession, type: Int) { callbacks++ }
                override fun onSetupResponseSent(session: AirPlaySession) { setupResponses++ }
            })

        fun handle(method: String, path: String, body: ByteArray = ByteArray(0)): RtspMessage.Response {
            val handler = AirPlaySession::class.java.getDeclaredMethod("handle", RtspMessage.Request::class.java)
            handler.isAccessible = true
            return handler.invoke(session, RtspMessage.Request(method, path, "RTSP/1.0", emptyMap(), body)) as RtspMessage.Response
        }
    }

    private class ScriptedSocket : Socket() {
        var bytes = ByteArray(0)
        override fun getInputStream() = ByteArrayInputStream(bytes)
        override fun getOutputStream() = ByteArrayOutputStream()
    }

    private class BatchedSocket : Socket() {
        var batches = emptyList<ByteArray>()
        @Volatile var readBatches = 0
        private val input = object : InputStream() {
            private var position = 0
            override fun read(target: ByteArray, offset: Int, length: Int): Int {
                if (length == 0) return 0
                if (readBatches >= batches.size) return -1
                val batch = batches[readBatches]
                val count = minOf(length, batch.size - position)
                batch.copyInto(target, offset, position, position + count)
                position += count
                if (position == batch.size) { position = 0; readBatches++ }
                return count
            }
            override fun read(): Int {
                val byte = ByteArray(1)
                return if (read(byte, 0, 1) < 0) -1 else byte[0].toInt() and 0xff
            }
            // available() remains zero: BufferedInputStream must not merge the next batch.
        }
        override fun getInputStream() = input
        override fun getOutputStream() = ByteArrayOutputStream()
    }

    private fun wire(method: String, path: String, body: ByteArray = ByteArray(0)) =
        "$method $path RTSP/1.0\r\nCSeq: 1\r\nContent-Length: ${body.size}\r\n\r\n".toByteArray() + body

    private fun read(socket: Socket, cipher: ControlCipher? = null): RtspMessage.Request {
        var accumulated = ByteArray(0)
        var encrypted = ByteArray(0)
        var result: RtspMessage.Request? = null
        while (result == null) {
            val byte = socket.getInputStream().read()
            check(byte >= 0) { "Unexpected EOF" }
            var plain = byteArrayOf(byte.toByte())
            if (cipher != null) {
                encrypted += plain
                val decrypted = cipher.decrypt(encrypted)
                encrypted = decrypted.rest
                plain = decrypted.data
            }
            accumulated += plain
            val parsed = RtspMessage.parseMessages(accumulated)
            accumulated = parsed.rest
            result = parsed.messages.firstOrNull()
        }
        return result!!
    }
}
