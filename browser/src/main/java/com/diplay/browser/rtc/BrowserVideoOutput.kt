package com.diplay.browser.rtc

import com.diplay.browser.BrowserDisplay
import com.diplay.browser.JpegVideoSink
import com.diplay.browser.LatestFrame
import com.shilapi.xcertplay.airplay.MediaSink
import com.shilapi.xcertplay.airplay.VideoCodec
import org.json.JSONObject
import java.io.Closeable
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicBoolean

/** Encoded video and explicit manual JPEG diagnostics live inside the browser module. */
class BrowserVideoOutput internal constructor(
    private val jpeg: MediaSink,
    private val closeJpeg: () -> Unit,
    private val clock: () -> Long = System::nanoTime,
    private val peerFactory: ((String, String) -> Unit) -> RtcPeer = { RtcNative(it) },
) : MediaSink, Closeable {
    constructor(display: BrowserDisplay, frames: LatestFrame, report: (String?) -> Unit,
        mediaBindAddress: () -> String? = { null }) :
        this(JpegVideoSink(display, frames, report), mediaBindAddress)
    private constructor(jpeg: JpegVideoSink, mediaBindAddress: () -> String?) :
        this(jpeg, jpeg::close, peerFactory = { RtcNative(it, bindAddress = mediaBindAddress()) })
    private val worker = Executors.newSingleThreadScheduledExecutor { Thread(it, "browser-rtc").apply { isDaemon = true } }
    private val queue = RtcFrameQueue()
    private val lock = Any()
    private var draining = false
    @Volatile private var closed = false
    @Volatile private var displayed = false
    @Volatile private var recovery: (() -> Unit)? = null
    @Volatile private var diagnostic: ((String) -> Unit)? = null
    private val rendered = AtomicBoolean()
    private val lastRecovery = AtomicLong(Long.MIN_VALUE)
    private var config: ByteArray? = null
    @Volatile private var codec = VideoCodec.H264
    @Volatile var codecName: String? = null; private set
    private var dropRasl = false
    private var parameters = ByteArray(0)
    private var enabled = false
    private val retry = RtcRetryPolicy(clock)
    private var reply: ((JSONObject) -> Boolean)? = null
    private var peer: RtcPeer? = null
    private var id = 0L
    @Volatile private var connected = false
    private var health: RtcHealth? = null
    private var recoveryPolicy = RtcRecoveryPolicy.BALANCED
    private var origin = -1L
    @Volatile var sentFrames = 0L; private set
    @Volatile var receivedFrames = 0L; private set
    @Volatile var sendFailures = 0L; private set
    @Volatile var fallbackReason: String? = null; private set
    @Volatile var eventLogger: (String) -> Unit = {}
    private var lastFeedbackLog = Long.MIN_VALUE
    private var lastSourceLog = Long.MIN_VALUE
    private fun log(message: String) { runCatching { eventLogger(message) } }
    val transport get() = when {
        displayed -> "webrtc"
        enabled || codec == VideoCodec.H265 -> "waiting"
        else -> "jpeg"
    }
    init { worker.scheduleAtFixedRate({ checkHealth() }, 1, 1, TimeUnit.SECONDS) }
    private fun execute(task: () -> Unit) {
        if (!closed) try { worker.execute { if (!closed) task() } } catch (_: RejectedExecutionException) { }
    }
    fun attach(rtc: Boolean, send: (JSONObject) -> Boolean) = attach(rtc, RtcRecoveryPolicy.BALANCED.graceMs, send)
    fun attach(rtc: Boolean, recoveryGraceMs: Long, send: (JSONObject) -> Boolean) = execute {
        stop(); reply = send; enabled = rtc
        recoveryPolicy = RtcRecoveryPolicy.fromMillis(recoveryGraceMs)
        start()
    }
    fun command(data: JSONObject) = execute {
        if (data.optLong("id", -1) != id) return@execute
        when (data.getString("type")) {
            "rtc-answer" -> runCatching {
                log("RTC attempt=$id answer ${RtcDiagnosticSummary.signaling(data.getString("sdp"))}")
                peer?.answer(data.getString("sdp"))
            }.onFailure { stop("answer-rejected") }
            "rtc-ready" -> if (connected && peer != null) {
                displayed = true; health?.ready(clock()); retry.healthy()
                (jpeg as? JpegVideoSink)?.setSuspended(true)
                reportDiagnostic("first frame rendered")
                log("RTC attempt=$id first browser frame")
            }
            "rtc-feedback" -> {
                val frames = data.getLong("decoded")
                health?.feedback(frames, clock())
                val now = clock()
                if (lastFeedbackLog == Long.MIN_VALUE || now - lastFeedbackLog >= 30_000_000_000L) {
                    lastFeedbackLog = now
                    log("RTC attempt=$id browser ${RtcDiagnosticSummary.feedback(data)}")
                }
            }
            "rtc-fallback" -> stop(data.optString("reason").takeIf { it in BROWSER_FAILURES }
                ?: "browser-fallback", data.optBoolean("retryable", true))
        }
    }
    fun detach() = execute { enabled = false; reply = null; stop() }
    override fun setVideoRecoveryHandler(type: Int, handler: () -> Unit) {
        jpeg.setVideoRecoveryHandler(type, handler)
        if (type == MAIN_SCREEN) recovery = handler
    }
    override fun setVideoDiagnosticHandler(type: Int, handler: (String) -> Unit) {
        if (type != MAIN_SCREEN) return
        diagnostic = handler; rendered.set(false)
        jpeg.setVideoDiagnosticHandler(type, ::reportDiagnostic)
    }
    private fun reportDiagnostic(message: String) {
        val callback = diagnostic ?: return
        if (message != "first frame rendered" || rendered.compareAndSet(false, true)) callback(message)
    }
    override fun onVideoCodec(type: Int, codec: VideoCodec) {
        if (type != MAIN_SCREEN) return
        val changed = this.codec != codec
        this.codec = codec
        codecName = codec.name
        log("Video source codec=${codec.name}")
        (jpeg as? JpegVideoSink)?.setSuspended(codec != VideoCodec.H264 || displayed)
        if (codec == VideoCodec.H264) jpeg.onVideoCodec(type, codec)
        if (changed) {
            connected = false
            execute { config = null; stop() }
        }
    }
    override fun onVideoConfig(type: Int, codecData: ByteArray) {
        if (codec == VideoCodec.H264) jpeg.onVideoConfig(type, codecData)
        if (type != MAIN_SCREEN) return
        val bytes = codecData.copyOf()
        execute {
            if (config?.contentEquals(bytes) == true) return@execute
            stop(); config = bytes; codecName = codec.name; start()
        }
    }
    override fun onVideoFrame(type: Int, naluBytes: ByteArray) = onVideoFrame(type, naluBytes, clock(), clock())
    override fun onVideoFrame(type: Int, naluBytes: ByteArray, senderNanos: Long, arrivalNanos: Long) {
        if (type != MAIN_SCREEN || closed) return
        receivedFrames++
        if (!displayed && codec == VideoCodec.H264) jpeg.onVideoFrame(type, naluBytes, senderNanos, arrivalNanos)
        if (!connected) return
        val frame = RtcAccessUnit.inspect(naluBytes, codec) ?: return
        val needsKey = synchronized(lock) {
            if (closed || !connected) return
            // A receiver joining at an HEVC CRA/BLA must not receive its RASL leading pictures.
            if (codec == VideoCodec.H265) {
                if (frame.key) dropRasl = true
                if (dropRasl && frame.rasl) return
                if (!frame.key && !frame.rasl) dropRasl = false
            }
            val prefix = if (frame.key) parameters else EMPTY
            queue.offer(frame.size, senderNanos, frame.key, clock(), prefix.size) { frame.copyAnnexB(prefix) }
            // Rejected dependent frames need recovery, but do not need an empty worker task.
            if (!draining && queue.size > 0) { draining = true; execute { drain() } }
            queue.needsKey
        }
        if (needsKey) requestKey()
    }
    override fun onScreenStreamActive(type: Int, active: Boolean) {
        if (type == MAIN_SCREEN && !active) diagnostic = null
        jpeg.onScreenStreamActive(type, active)
        if (type == MAIN_SCREEN && !active) execute { stop(); config = null }
    }
    private fun start() {
        val bytes = config ?: return
        if (!enabled || reply == null || !retry.start()) return
        try {
            val video = try { RtcVideoConfig.parse(codec, bytes) } catch (_: IllegalArgumentException) {
                stop("invalid-video-config", retryable = false); return
            }
            parameters = video.parameters
            // A reconnect creates a new output while the old worker may still
            // send rtc-stop. Keep IDs unique across outputs on this WebSocket.
            val generation = OFFER_IDS.incrementAndGet().also { id = it }
            lastFeedbackLog = Long.MIN_VALUE; lastSourceLog = Long.MIN_VALUE
            log("RTC attempt=$id start codec=${video.codec.name} graceMs=${recoveryPolicy.graceMs}")
            origin = -1; sentFrames = 0; sendFailures = 0; fallbackReason = null
            health = RtcHealth(clock(), recoveryPolicy)
            synchronized(lock) { queue.reset() }
            peer = peerFactory { kind, value -> execute {
                if (id == generation && peer != null) when (kind) {
                    "binding" -> log("RTC attempt=$id binding=${if (value == "any") "any" else "entry-local-ipv4"}")
                    "offer" -> {
                        log("RTC attempt=$id offer ${RtcDiagnosticSummary.signaling(value)}")
                        if (reply?.invoke(JSONObject().put("type", "rtc-offer").put("id", id)
                            .put("codec", video.codec.name).put("sdp", value).put("recoveryGraceMs", recoveryPolicy.graceMs)) != true) stop("offer-rejected")
                    }
                    "connected" -> {
                        log("RTC attempt=$id connected")
                        synchronized(lock) {
                            queue.takeSendFailure()?.let { health?.sendFailed(it); retry.interrupted() }
                            queue.clear()
                        }
                        health?.connected(clock())
                        connected = true; requestKey(force = true)
                    }
                    "disconnected" -> {
                        log("RTC attempt=$id disconnected")
                        connected = false; health?.disconnected(clock()); retry.interrupted()
                        synchronized(lock) { queue.invalidate(clock()) }
                        // Keep the last displayed frame and the peer until the recovery deadline.
                    }
                    "keyframe" -> requestKey()
                    "failed" -> stop("connection-failed")
                }
            } }
            // Retain the peer before start so a partial native setup is closed on failure.
            peer?.start(video.codec, video.fmtp)
        } catch (_: Exception) { stop("transport-unavailable") }
        catch (_: LinkageError) { stop("native-unavailable", retryable = false) }
    }
    private fun drain() {
        repeat(6) {
            val frame = synchronized(lock) {
                val next = queue.poll(clock())
                queue.takeSendFailure()?.let { health?.sendFailed(it); retry.interrupted() }
                next
            } ?: return@repeat
            if (peer == null || !connected) return@repeat
            if (origin < 0L) origin = frame.nanos
            val timestamp = ((frame.nanos - origin).coerceAtLeast(0) / 1000 * 90 / 1000) and 0xffff_ffffL
            if (runCatching { peer?.send(frame.bytes, timestamp) == true }.getOrDefault(false)) {
                sentFrames++; health?.sent(clock())
            }
            else {
                sendFailures++; health?.sendFailed(clock()); retry.interrupted()
                synchronized(lock) { queue.invalidate(clock()) }; requestKey()
            }
        }
        synchronized(lock) {
            draining = false
            if (queue.needsKey) requestKey()
            if (queue.size > 0) { draining = true; execute { drain() } }
        }
    }
    private fun requestKey(force: Boolean = false) {
        val now = clock()
        val previous = lastRecovery.get()
        if (!force && previous != Long.MIN_VALUE && now - previous < 500_000_000) return
        if (lastRecovery.compareAndSet(previous, now)) recovery?.invoke()
    }
    private fun checkHealth() {
        if (peer == null) { start(); return }
        val now = clock()
        if (lastSourceLog == Long.MIN_VALUE || now - lastSourceLog >= 30_000_000_000L) {
            lastSourceLog = now
            log("RTC attempt=$id source received=$receivedFrames sent=$sentFrames sendFailures=$sendFailures connected=$connected displayed=$displayed")
        }
        val waitingForKey = synchronized(lock) {
            queue.takeSendFailure()?.let { health?.sendFailed(it); retry.interrupted() }
            queue.recovering(now)
        }
        val reason = health?.failureReason(now) ?: synchronized(lock) {
            if (queue.recoveryExpired(now, recoveryPolicy.graceNanos)) "keyframe-timeout" else null
        }
        if (reason != null) { retry.interrupted(); stop(reason); return }
        if (displayed && connected && !waitingForKey && health?.recovering(now) == false) retry.healthy()
        else retry.interrupted()
        if (connected && (waitingForKey || health?.needsKeyframe(now) == true)) requestKey()
        val progress = JSONObject().put("type", "rtc-progress").put("id", id)
            .put("sent", sentFrames).put("received", receivedFrames).put("sendFailures", sendFailures)
            .put("recoveryGraceMs", recoveryPolicy.graceMs)
            .put("recovering", waitingForKey || health?.recovering(now) == true)
            .put("queueBudgetMs", RtcFrameQueue.MAX_AGE_NS / 1_000_000)
        synchronized(lock) {
            progress.put("queueFrames", queue.size).put("queueBytes", queue.bytes)
                .put("expiredFrames", queue.expiredFrames).put("overflowFrames", queue.overflowFrames)
                .put("keyframeSkips", queue.keyframeSkips).put("invalidatedFrames", queue.invalidatedFrames)
        }
        reply?.invoke(progress)
    }
    private fun stop(reason: String? = null, retryable: Boolean = true) {
        val wasDisplaying = displayed
        val hadAttempt = retry.inFlight
        if (reason == null) retry.reset() else retry.finish(retryable)
        displayed = false; connected = false; health = null
        (jpeg as? JpegVideoSink)?.setSuspended(codec != VideoCodec.H264)
        val old = peer; peer = null
        if (old != null || reason != null) log("RTC attempt=$id stopped reason=${reason ?: "session-change"} retryable=$retryable " +
            "received=$receivedFrames sent=$sentFrames sendFailures=$sendFailures displayed=$wasDisplaying")
        runCatching { old?.close() }
        synchronized(lock) { queue.clear(); dropRasl = false }
        if (reason != null && hadAttempt) { fallbackReason = reason; reportDiagnostic("browser RTC fallback: $reason") }
        if (old != null || (reason != null && retry.blocked)) {
            reply?.invoke(JSONObject().put("type", "rtc-stop").put("id", id).put("reason", reason)
                .put("retryAfterMs", retry.retryAfterMs).put("retryBlocked", retry.blocked))
        }
        if (wasDisplaying) requestKey()
    }
    override fun close() {
        if (closed) return
        closed = true; displayed = false
        worker.execute { stop() }
        worker.shutdown()
        closeJpeg()
    }
    companion object {
        private const val MAIN_SCREEN = 110
        private val EMPTY = ByteArray(0)
        private val OFFER_IDS = AtomicLong()
        private val BROWSER_FAILURES = setOf("first-frame-timeout", "connection-failed", "connection-timeout",
            "disconnected-timeout", "decoder-stall", "stats-timeout", "video-unsupported", "hevc-unsupported",
            "playback-failed", "negotiation-failed", "ice-gathering-timeout")
    }
}
