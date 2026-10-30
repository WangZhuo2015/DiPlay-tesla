package com.diplay.browser.rtc

import com.diplay.browser.BrowserDisplay
import com.diplay.browser.JpegVideoSink
import com.diplay.browser.LatestFrame
import com.shilapi.xcertplay.airplay.MediaSink
import com.shilapi.xcertplay.airplay.VideoCodec
import com.shilapi.xcertplay.media.MediaCodecSupport
import org.json.JSONObject
import java.io.Closeable
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicBoolean

/** Encoded video and JPEG fallback live entirely inside the browser module. */
class BrowserVideoOutput internal constructor(
    private val jpeg: MediaSink,
    private val closeJpeg: () -> Unit,
    private val clock: () -> Long = System::nanoTime,
    private val peerFactory: ((String, String) -> Unit) -> RtcPeer = { RtcNative(it) },
) : MediaSink, Closeable {
    constructor(display: BrowserDisplay, frames: LatestFrame, report: (String?) -> Unit) :
        this(JpegVideoSink(display, frames, report))
    private constructor(jpeg: JpegVideoSink) : this(jpeg, jpeg::close)
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
    val transport get() = if (displayed) "webrtc" else "jpeg"
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
            "rtc-answer" -> runCatching { peer?.answer(data.getString("sdp")) }.onFailure { stop("answer-rejected") }
            "rtc-ready" -> if (connected && peer != null) {
                displayed = true; health?.ready(clock()); retry.healthy()
                (jpeg as? JpegVideoSink)?.setSuspended(true)
                reportDiagnostic("first frame rendered")
            }
            "rtc-feedback" -> {
                val frames = data.getLong("decoded")
                health?.feedback(frames, clock())
            }
            "rtc-fallback" -> stop("browser-fallback", data.optBoolean("retryable", true))
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
        jpeg.onVideoCodec(type, codec)
        if (type == MAIN_SCREEN && codec != VideoCodec.H264) execute { config = null; stop() }
    }
    override fun onVideoConfig(type: Int, codecData: ByteArray) {
        jpeg.onVideoConfig(type, codecData)
        if (type != MAIN_SCREEN) return
        val bytes = codecData.copyOf()
        execute {
            if (config?.contentEquals(bytes) == true) return@execute
            stop(); config = bytes; start()
        }
    }
    override fun onVideoFrame(type: Int, naluBytes: ByteArray) = onVideoFrame(type, naluBytes, clock(), clock())
    override fun onVideoFrame(type: Int, naluBytes: ByteArray, senderNanos: Long, arrivalNanos: Long) {
        if (type != MAIN_SCREEN || closed) return
        receivedFrames++
        if (!displayed) jpeg.onVideoFrame(type, naluBytes, senderNanos, arrivalNanos)
        if (!connected) return
        val frame = RtcAccessUnit.inspect(naluBytes) ?: return
        val needsKey = synchronized(lock) {
            if (closed || !connected) return
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
            val (sps, pps) = MediaCodecSupport.avcParameterSets(bytes)
            if (sps.size < 4 || pps.isEmpty()) { stop("invalid-video-config", retryable = false); return }
            parameters = START + sps + START + pps
            val profile = sps.sliceArray(1..3).joinToString("") { "%02x".format(it.toInt() and 255) }
            // A reconnect creates a new output while the old worker may still
            // send rtc-stop. Keep IDs unique across outputs on this WebSocket.
            val generation = OFFER_IDS.incrementAndGet().also { id = it }
            origin = -1; sentFrames = 0; sendFailures = 0; fallbackReason = null
            health = RtcHealth(clock(), recoveryPolicy)
            synchronized(lock) { queue.reset() }
            peer = peerFactory { kind, value -> execute {
                if (id == generation && peer != null) when (kind) {
                    "offer" -> if (reply?.invoke(JSONObject().put("type", "rtc-offer").put("id", id)
                            .put("sdp", value).put("recoveryGraceMs", recoveryPolicy.graceMs)) != true) stop("offer-rejected")
                    "connected" -> {
                        synchronized(lock) {
                            queue.takeSendFailure()?.let { health?.sendFailed(it); retry.interrupted() }
                            queue.clear()
                        }
                        health?.connected(clock())
                        connected = true; requestKey(force = true)
                    }
                    "disconnected" -> {
                        connected = false; health?.disconnected(clock()); retry.interrupted()
                        synchronized(lock) { queue.invalidate(clock()) }
                        // Keep the last displayed frame and the peer until the recovery deadline.
                    }
                    "keyframe" -> requestKey()
                    "failed" -> stop("connection-failed")
                }
            } }
            // Retain the peer before start so a partial native setup is closed on failure.
            peer?.start("profile-level-id=$profile;packetization-mode=1;level-asymmetry-allowed=1")
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
        (jpeg as? JpegVideoSink)?.setSuspended(false)
        val old = peer; peer = null
        runCatching { old?.close() }
        synchronized(lock) { queue.clear() }
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
        private val START = byteArrayOf(0,0,0,1)
        private val EMPTY = ByteArray(0)
        private val OFFER_IDS = AtomicLong()
    }
}
