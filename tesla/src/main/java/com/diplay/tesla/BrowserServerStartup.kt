package com.diplay.tesla

import java.io.Closeable
import java.net.BindException

/** Keep the preferred URL when available; firmware web servers may already own it. */
internal fun <T : Closeable> startBrowserServer(
    ports: IntRange = 8080..8089,
    create: (Int) -> T,
    start: (T) -> Unit,
): Pair<Int, T> {
    require(!ports.isEmpty())
    var lastFailure: Exception? = null
    for (port in ports) {
        val server = create(port)
        try {
            start(server)
            return port to server
        } catch (failure: Exception) {
            runCatching { server.close() }
            if (generateSequence<Throwable>(failure) { it.cause }.none { it is BindException }) throw failure
            lastFailure = failure
        }
    }
    throw checkNotNull(lastFailure)
}
