package com.diplay.browser

import fi.iki.elonen.NanoHTTPD.IHTTPSession
import fi.iki.elonen.NanoWSD.WebSocket
import fi.iki.elonen.NanoWSD.WebSocketFrame
import org.json.JSONObject
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/** One bounded writer for PCM and signaling. Video payloads travel over WebRTC, not this queue. */
internal class BrowserMediaSocket(
    handshake: IHTTPSession,
    private val token: String,
    private val media: BrowserMediaHub,
    private val ended: (BrowserMediaSocket) -> Unit,
) : WebSocket(object : IHTTPSession by handshake {
    override fun getInputStream() = BoundedWebSocketInput(handshake.inputStream)
}) {
    private data class Packet(val frame: WebSocketFrame, val queued: Long, val audio: Boolean)
    private val queue = ArrayBlockingQueue<Packet>(32)
    private val pending = ConcurrentHashMap<Long, Long>()
    private val closed = AtomicBoolean()
    @Volatile private var failed = false
    @Volatile private var authenticated = false
    @Volatile private var seen = System.nanoTime()
    private val writer = Thread({
        try {
            while (!closed.get()) {
                val packet = queue.take()
                if (packet.audio && System.nanoTime() - packet.queued > 500_000_000) { disconnect(); break }
                super.sendFrame(packet.frame)
            }
        } catch (_: InterruptedException) { } catch (_: IOException) { disconnect() }
    }, "browser-media-writer").apply { isDaemon = true }
    override fun onOpen() { writer.start() }
    private fun sendControl(data: JSONObject): Boolean = enqueue(WebSocketFrame(WebSocketFrame.OpCode.Text, true, data.toString()), false)
    private fun enqueue(frame: WebSocketFrame, audio: Boolean): Boolean {
        if (closed.get()) return false
        if (queue.offer(Packet(frame, System.nanoTime(), audio))) return true
        requestDisconnect(); return false
    }
    private fun sendAudio(data: ByteArray, sequence: Long): Boolean {
        if (pending.size >= 24 || pending.values.any { System.nanoTime() - it > 500_000_000 }) { requestDisconnect(); return false }
        pending[sequence] = System.nanoTime()
        if (enqueue(WebSocketFrame(WebSocketFrame.OpCode.Binary, true, data), true)) return true
        pending.remove(sequence); return false
    }
    override fun sendFrame(frame: WebSocketFrame) { enqueue(frame, false) }
    override fun onMessage(message: WebSocketFrame) {
        if (closed.get()) return
        try {
            require(message.opCode == WebSocketFrame.OpCode.Text)
            val data = JSONObject(message.textPayload)
            val type = data.getString("type")
            if (type != "rtc-answer") require(message.binaryPayload.size <= 2048)
            if (!authenticated) {
                require(type == "hello" && MessageDigest.isEqual(data.getString("token").toByteArray(), token.toByteArray()))
                require(media.attach(this, data.optBoolean("rtc", false), ::sendControl, ::sendAudio,
                    data.optLong("recoveryGraceMs", 10_000L)))
                authenticated = true
                sendControl(JSONObject().put("type", "welcome"))
            } else when (type) {
                "ping" -> sendControl(JSONObject().put("type", "pong"))
                "audio-ready" -> {
                    if (!data.getBoolean("playback")) { pending.clear(); queue.removeIf { it.audio } }
                    media.command(this, data)
                }
                "audio-ack" -> pending.remove(data.getLong("sequence"))
                "rtc-answer" -> { require(data.getString("sdp").length <= 32000); media.command(this, data) }
                "rtc-ready" -> media.command(this, data)
                "rtc-fallback" -> {
                    require(!data.has("retryable") || data.get("retryable") is Boolean)
                    media.command(this, data)
                }
                "rtc-feedback" -> { require(data.getLong("decoded") in 0..9_007_199_254_740_991L); media.command(this, data) }
                else -> throw IllegalArgumentException()
            }
            seen = System.nanoTime()
        } catch (_: Exception) { disconnect() }
    }
    fun expire() {
        val now = System.nanoTime()
        if (failed || now - seen > (if (authenticated) 5_000_000_000L else 3_000_000_000L) || pending.values.any { now - it > 500_000_000 }) disconnect()
    }
    private fun requestDisconnect() {
        // May run under the PCM route lock: defer hub cleanup to the reader/watchdog.
        failed = true; queue.clear(); writer.interrupt()
        runCatching { handshakeRequest.inputStream.close() }
    }
    fun disconnect() {
        if (!closed.compareAndSet(false, true)) return
        media.detach(this); pending.clear(); queue.clear(); writer.interrupt()
        runCatching { handshakeRequest.inputStream.close() }
        ended(this)
    }
    // NanoWSD passes null for both fields when a client sends a valid empty close frame.
    override fun close(code: WebSocketFrame.CloseCode?, reason: String?, initiatedByRemote: Boolean) = disconnect()
    override fun onClose(code: WebSocketFrame.CloseCode?, reason: String?, initiatedByRemote: Boolean) = disconnect()
    override fun onException(exception: IOException) = disconnect()
    override fun onPong(pong: WebSocketFrame) { seen = System.nanoTime() }
}
