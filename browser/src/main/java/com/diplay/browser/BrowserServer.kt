package com.diplay.browser

import android.content.res.AssetManager
import com.shilapi.xcertplay.airplay.AirPlayContact
import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoHTTPD.AsyncRunner
import fi.iki.elonen.NanoHTTPD.ClientHandler
import fi.iki.elonen.NanoHTTPD.IHTTPSession
import fi.iki.elonen.NanoHTTPD.Method
import fi.iki.elonen.NanoHTTPD.Response
import fi.iki.elonen.NanoHTTPD.newFixedLengthResponse
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.Closeable
import java.security.MessageDigest
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/** This transport knows only the browser contract; it never starts a network proxy or CarPlay. */
interface BrowserTarget {
    fun status(): JSONObject
    fun touch(contacts: List<AirPlayContact>): Boolean
    fun action(name: String): Boolean
    fun saveDisplay(display: BrowserDisplay)
}

class BrowserServer(
    port: Int,
    private val assets: AssetManager,
    private val token: String,
    private val frames: LatestFrame,
    private val target: BrowserTarget,
) : Closeable {
    private val controls = BrowserControl(target::touch)
    private val watchdog = Executors.newSingleThreadScheduledExecutor { Thread(it, "browser-touch-watchdog").apply { isDaemon = true } }
    private val clients = ConcurrentHashMap.newKeySet<ClientHandler>()
    private val workers = ThreadPoolExecutor(6, 6, 30, TimeUnit.SECONDS, ArrayBlockingQueue(12),
        { Thread(it, "browser-http").apply { isDaemon = true } })
    private val http = object : NanoHTTPD(port) {
        override fun serve(session: IHTTPSession): Response = serveRequest(session)
    }
    init {
        require(port in 1024..65535 && token.matches(Regex("[a-f0-9]{32}")))
        http.setAsyncRunner(object : AsyncRunner {
            override fun exec(handler: ClientHandler) {
                clients.add(handler)
                try { workers.execute(handler) }
                catch (_: java.util.concurrent.RejectedExecutionException) { clients.remove(handler); handler.close() }
            }
            override fun closed(handler: ClientHandler) { clients.remove(handler) }
            override fun closeAll() { clients.toList().forEach { it.close() }; clients.clear() }
        })
        watchdog.scheduleAtFixedRate({ controls.expire() }, 250, 250, TimeUnit.MILLISECONDS)
    }
    fun start(timeoutMillis: Int = 5000, daemon: Boolean = true) { http.start(timeoutMillis, daemon) }
    private fun serveRequest(session: IHTTPSession): Response {
        try {
            if (!session.uri.startsWith("/api/")) {
                if (session.method != Method.GET) return reply(Response.Status.METHOD_NOT_ALLOWED)
                val asset = when (session.uri) {
                    "/", "/index.html" -> "index.html" to "text/html; charset=utf-8"
                    "/app.js" -> "app.js" to "text/javascript; charset=utf-8"
                    "/style.css" -> "style.css" to "text/css; charset=utf-8"
                    else -> return reply(Response.Status.NOT_FOUND)
                }
                return assets.open("tesla/${asset.first}").use { input ->
                    val bytes = input.readBytes()
                    decorate(newFixedLengthResponse(Response.Status.OK, asset.second, ByteArrayInputStream(bytes), bytes.size.toLong()))
                }
            }
            val authorization = session.headers["authorization"].orEmpty()
            if (!MessageDigest.isEqual(authorization.toByteArray(Charsets.UTF_8), "Bearer $token".toByteArray(Charsets.UTF_8))) {
                return reply(Response.Status.UNAUTHORIZED)
            }
            val origin = session.headers["origin"]
            if (origin != null && runCatching { java.net.URI(origin).rawAuthority }.getOrNull() != session.headers["host"]) return reply(Response.Status.FORBIDDEN)
            return when (session.uri) {
                "/api/status" -> if (session.method == Method.GET) json(target.status()) else reply(Response.Status.METHOD_NOT_ALLOWED)
                "/api/frame" -> {
                    if (session.method != Method.GET) return reply(Response.Status.METHOD_NOT_ALLOWED)
                    val sequence = session.parameters["after"]?.firstOrNull()?.toLongOrNull() ?: -1
                    val frame = frames.after(sequence) ?: return reply(Response.Status.NO_CONTENT)
                    decorate(newFixedLengthResponse(Response.Status.OK, "image/jpeg", ByteArrayInputStream(frame.jpeg), frame.jpeg.size.toLong()))
                        .apply { addHeader("X-Frame-Sequence", frame.sequence.toString()) }
                }
                "/api/touch" -> {
                    val body = body(session) ?: return reply(Response.Status.BAD_REQUEST)
                    val contacts = body.getJSONArray("contacts")
                    require(contacts.length() <= 2)
                    val points = (0 until contacts.length()).map { index ->
                        val point = contacts.getJSONObject(index)
                        AirPlayContact(point.getInt("id"), point.getDouble("x"), point.getDouble("y"), point.getBoolean("down"))
                    }
                    if (controls.touch(body.getString("client"), points)) json(JSONObject().put("ok", true))
                    else reply(Response.Status.CONFLICT)
                }
                "/api/action" -> {
                    val body = body(session) ?: return reply(Response.Status.BAD_REQUEST)
                    val action = body.getString("action")
                    require(action in setOf("home", "back", "siri", "play", "next", "previous", "reconnect"))
                    controls.release()
                    if (target.action(action)) json(JSONObject().put("ok", true)) else reply(Response.Status.CONFLICT)
                }
                "/api/display" -> {
                    val body = body(session) ?: return reply(Response.Status.BAD_REQUEST)
                    val display = BrowserDisplayJson.decode(body)
                    target.saveDisplay(display)
                    json(target.status())
                }
                else -> reply(Response.Status.NOT_FOUND)
            }
        } catch (_: IllegalArgumentException) { return reply(Response.Status.BAD_REQUEST) }
        catch (_: org.json.JSONException) { return reply(Response.Status.BAD_REQUEST) }
        catch (_: java.io.IOException) { return reply(Response.Status.INTERNAL_ERROR) }
    }
    private fun body(session: IHTTPSession): JSONObject? {
        if (session.method != Method.POST || session.headers["content-type"]?.substringBefore(';') != "application/json") return null
        if (session.headers.containsKey("transfer-encoding")) return null
        val length = session.headers["content-length"]?.toIntOrNull() ?: return null
        if (length !in 1..8192) return null
        val bytes = ByteArray(length)
        var offset = 0
        while (offset < length) {
            val read = session.inputStream.read(bytes, offset, length - offset)
            if (read < 0) return null
            offset += read
        }
        return JSONObject(String(bytes, Charsets.UTF_8))
    }
    private fun json(value: JSONObject) = decorate(newFixedLengthResponse(Response.Status.OK, "application/json", value.toString()))
    private fun reply(status: Response.Status) = decorate(newFixedLengthResponse(status, "text/plain", status.description))
    private fun decorate(response: Response): Response = response.apply {
        addHeader("Cache-Control", "no-store")
        addHeader("X-Content-Type-Options", "nosniff")
        addHeader("Referrer-Policy", "no-referrer")
        addHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' blob:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        addHeader("Connection", "close")
    }
    override fun close() {
        controls.release()
        http.stop()
        workers.shutdownNow()
        watchdog.shutdownNow()
    }
    fun releaseInput() { controls.release() }
}
