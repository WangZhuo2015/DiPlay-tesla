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
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

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
    private val audioRecovery = AtomicReference<String?>()
    private val droppedAudio = AtomicLong()
    @Volatile private var failureReason: String? = null
    @Volatile private var authenticated = false
    private var attached = false
    private var rtc = false
    private var recoveryGraceMs = 10_000L
    private var reportedBusy = false
    @Volatile private var seen = System.nanoTime()
    private val writer = Thread({
        try {
            while (!closed.get()) {
                val packet = queue.take()
                if (packet.audio) {
                    if (audioRecovery.get() != null) { droppedAudio.incrementAndGet(); continue }
                    if (System.nanoTime() - packet.queued > 500_000_000) {
                        requestAudioRecovery("audio-write-expired"); droppedAudio.incrementAndGet(); continue
                    }
                }
                super.sendFrame(packet.frame)
            }
        } catch (_: InterruptedException) { } catch (failure: IOException) { disconnect("writer-${failure.javaClass.simpleName}") }
    }, "browser-media-writer").apply { isDaemon = true }
    override fun onOpen() { writer.start() }
    private fun sendControl(data: JSONObject): Boolean = enqueue(WebSocketFrame(WebSocketFrame.OpCode.Text, true, data.toString()), false)
    private fun enqueue(frame: WebSocketFrame, audio: Boolean): Boolean {
        if (closed.get()) return false
        if (queue.offer(Packet(frame, System.nanoTime(), audio))) return true
        requestAudioRecovery("audio-queue-full")
        if (audio) return false
        if (queue.offer(Packet(frame, System.nanoTime(), false))) return true
        requestDisconnect("control-queue-full"); return false
    }
    private fun sendAudio(data: ByteArray, sequence: Long): Boolean {
        if (closed.get()) return false
        // Consume stale PCM on this route: network jitter must not switch Android audio focus.
        if (audioRecovery.get() != null) { droppedAudio.incrementAndGet(); return true }
        if (pending.size >= 24) {
            requestAudioRecovery("audio-window-full"); droppedAudio.incrementAndGet(); return true
        }
        if (pending.values.any { System.nanoTime() - it > 500_000_000 }) {
            requestAudioRecovery("audio-ack-timeout"); droppedAudio.incrementAndGet(); return true
        }
        pending[sequence] = System.nanoTime()
        if (enqueue(WebSocketFrame(WebSocketFrame.OpCode.Binary, true, data), true)) return true
        pending.remove(sequence)
        if (closed.get()) return false
        droppedAudio.incrementAndGet(); return true
    }
    private fun requestAudioRecovery(reason: String) {
        if (audioRecovery.compareAndSet(null, reason)) {
            queue.removeIf { packet ->
                if (packet.audio) { droppedAudio.incrementAndGet(); true } else false
            }
        }
    }
    override fun sendFrame(frame: WebSocketFrame) { enqueue(frame, false) }
    private fun claimMedia() {
        if (attached) return
        attached = media.attach(this, rtc, ::sendControl, ::sendAudio, recoveryGraceMs)
        if (!attached && !reportedBusy) { reportedBusy = true; media.note("Browser media busy: another page owns playback") }
        sendControl(JSONObject().put("type", if (attached) "welcome" else "media-busy"))
    }
    override fun onMessage(message: WebSocketFrame) {
        if (closed.get()) return
        try {
            require(message.opCode == WebSocketFrame.OpCode.Text)
            val data = JSONObject(message.textPayload)
            val type = data.getString("type")
            if (type != "rtc-answer") require(message.binaryPayload.size <= 2048)
            if (!authenticated) {
                require(type == "hello" && MessageDigest.isEqual(data.getString("token").toByteArray(), token.toByteArray()))
                rtc = data.optBoolean("rtc", false)
                recoveryGraceMs = data.optLong("recoveryGraceMs", 10_000L)
                authenticated = true
                val mode = data.optString("videoMode").takeIf { it in setOf("auto", "jpeg") } ?: "unknown"
                media.note("Browser hello mode=$mode rtc=$rtc recoveryGraceMs=${com.diplay.browser.rtc.RtcRecoveryPolicy.fromMillis(recoveryGraceMs).graceMs}")
                claimMedia()
            } else when (type) {
                "ping" -> { claimMedia(); sendControl(JSONObject().put("type", "pong")) }
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
        } catch (failure: Exception) { disconnect("message-${failure.javaClass.simpleName}") }
    }
    fun expire() {
        val now = System.nanoTime()
        val failure = failureReason
        when {
            failure != null -> { disconnect(failure); return }
            now - seen > (if (authenticated) 5_000_000_000L else 3_000_000_000L) ->
                { disconnect(if (authenticated) "heartbeat-timeout" else "authentication-timeout"); return }
            pending.values.any { now - it > 500_000_000 } -> requestAudioRecovery("audio-ack-timeout")
        }
        val reason = audioRecovery.get()
        if (reason != null && !closed.get()) {
            val pendingCount = pending.size
            pending.clear()
            // Hub/PCM locks are acquired only on the watchdog, never from sendAudio's PCM callback.
            media.resetAudio(this)
            audioRecovery.compareAndSet(reason, null)
            media.note("Browser audio reset reason=$reason pendingAudio=$pendingCount droppedAudio=${droppedAudio.get()}")
        }
    }
    private fun requestDisconnect(reason: String) {
        // May run under the PCM route lock: defer hub cleanup to the reader/watchdog.
        if (failureReason == null) failureReason = reason
        queue.clear(); writer.interrupt()
        runCatching { handshakeRequest.inputStream.close() }
    }
    fun disconnect(reason: String = "local-close") {
        if (!closed.compareAndSet(false, true)) return
        val now = System.nanoTime()
        val oldest = pending.values.minOrNull()
        media.note("Browser socket closed reason=${failureReason ?: reason} authenticated=$authenticated " +
            "pendingAudio=${pending.size} oldestAudioMs=${oldest?.let { (now - it).coerceAtLeast(0) / 1_000_000 } ?: 0} " +
            "queued=${queue.size} idleMs=${(now - seen).coerceAtLeast(0) / 1_000_000}")
        media.detach(this); pending.clear(); queue.clear(); writer.interrupt()
        runCatching { handshakeRequest.inputStream.close() }
        ended(this)
    }
    // NanoWSD passes null for both fields when a client sends a valid empty close frame.
    override fun close(code: WebSocketFrame.CloseCode?, reason: String?, initiatedByRemote: Boolean) =
        disconnect("${if (initiatedByRemote) "remote" else "local"}-close-${code?.name ?: "empty"}")
    override fun onClose(code: WebSocketFrame.CloseCode?, reason: String?, initiatedByRemote: Boolean) =
        disconnect("${if (initiatedByRemote) "remote" else "local"}-close-${code?.name ?: "empty"}")
    override fun onException(exception: IOException) = disconnect("reader-${exception.javaClass.simpleName}")
    override fun onPong(pong: WebSocketFrame) { seen = System.nanoTime() }
}
