package com.diplay.tesla

import org.junit.Assert.*
import org.junit.Test
import java.net.ServerSocket

class BrowserServerStartupTest {
    @Test fun occupiedPortUsesAnotherSocketAndReturnsItsActualPort() {
        ServerSocket(0).use { occupied ->
            val attempts = mutableListOf<ServerSocket>()
            val port = occupied.localPort
            val (selected, server) = startBrowserServer(port..minOf(port + 9, 65535),
                create = { ServerSocket().also(attempts::add) },
                start = { it.bind(java.net.InetSocketAddress(port + attempts.size - 1)) })
            server.use {
                assertTrue(selected > port)
                assertEquals(selected, it.localPort)
                assertTrue(attempts.dropLast(1).all { socket -> socket.isClosed })
                assertFalse(occupied.isClosed)
            }
        }
    }

    @Test fun unrelatedFailureClosesTheSocketAndDoesNotTryOtherPorts() {
        val attempts = mutableListOf<ServerSocket>()
        val denied = SecurityException("Denied by host")
        try {
            startBrowserServer(create = { ServerSocket().also(attempts::add) }, start = { throw denied })
            fail("Expected the original failure")
        } catch (failure: SecurityException) {
            assertSame(denied, failure)
            assertEquals(1, attempts.size)
            assertTrue(attempts.single().isClosed)
        }
    }
}
