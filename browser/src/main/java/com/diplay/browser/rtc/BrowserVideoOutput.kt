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
    @Volatile private var lastRecovery = 0L
    private var config: ByteArray? = null
    private var parameters = ByteArray(0)
    private var enabled = false
    private var attempted = false
    private var reply: ((JSONObject) -> Boolean)? = null
    private var peer: RtcPeer? = null
    private var id = 0L
    @Volatile private var connected = false
    private var health: RtcHealth? = null
    private var origin = -1L
    @Volatile var sentFrames = 0L; private set
    @Volatile var receivedFrames = 0L; private set
    @Volatile var sendFailures = 0L; private set
    val transport get() = if (displayed) "webrtc" else "jpeg"
    init { worker.scheduleAtFixedRate({ checkHealth() }, 1, 1, TimeUnit.SECONDS) }
    private fun execute(task: () -> Unit) {
        if (!closed) try { worker.execute { if (!closed) task() } } catch (_: RejectedExecutionException) { }
    }
    fun attach(rtc: Boolean, send: (JSONObject) -> Boolean) = execute {
        stop(); reply = send; enabled = rtc; attempted = false; start()
    }
    fun command(data: JSONObject) = execute {
        if (data.optLong("id", -1) != id) return@execute
        when (data.getString("type")) {
            "rtc-answer" -> runCatching { peer?.answer(data.getString("sdp")) }.onFailure { stop() }
            "rtc-ready" -> if (connected && peer != null) {
                displayed = true; health?.ready(System.nanoTime()); (jpeg as? JpegVideoSink)?.setSuspended(true)
                reportDiagnostic("first frame rendered")
            }
            "rtc-feedback" -> {
                val frames = data.getLong("decoded")
                health?.feedback(frames, System.nanoTime())
            }
            "rtc-fallback" -> stop()
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
            stop(); config = bytes; attempted = false; start()
        }
    }
    override fun onVideoFrame(type: Int, naluBytes: ByteArray) = onVideoFrame(type, naluBytes, System.nanoTime(), System.nanoTime())
    override fun onVideoFrame(type: Int, naluBytes: ByteArray, senderNanos: Long, arrivalNanos: Long) {
        if (type != MAIN_SCREEN || closed) return
        receivedFrames++
        if (!displayed) jpeg.onVideoFrame(type, naluBytes, senderNanos, arrivalNanos)
        if (!connected) return
        val annex = MediaCodecSupport.toAnnexB(naluBytes)
        if (annex.isEmpty()) return
        synchronized(lock) {
            if (!queue.offer(annex, senderNanos, MediaCodecSupport.isRandomAccess(annex, VideoCodec.H264), System.nanoTime())) requestKey()
            if (!draining) { draining = true; execute { drain() } }
        }
    }
    override fun onScreenStreamActive(type: Int, active: Boolean) {
        if (type == MAIN_SCREEN && !active) diagnostic = null
        jpeg.onScreenStreamActive(type, active)
        if (type == MAIN_SCREEN && !active) execute { stop(); config = null; attempted = false }
    }
    private fun start() {
        val bytes = config ?: return
        if (!enabled || attempted || reply == null) return
        attempted = true
        try {
            val (sps, pps) = MediaCodecSupport.avcParameterSets(bytes)
            require(sps.size >= 4 && pps.isNotEmpty())
            parameters = START + sps + START + pps
            val profile = sps.sliceArray(1..3).joinToString("") { "%02x".format(it.toInt() and 255) }
            // A reconnect creates a new output while the old worker may still
            // send rtc-stop. Keep IDs unique across outputs on this WebSocket.
            val generation = OFFER_IDS.incrementAndGet().also { id = it }
            origin = -1; sentFrames = 0; health = RtcHealth(System.nanoTime())
            peer = peerFactory { kind, value -> execute {
                if (id == generation && peer != null) when (kind) {
                    "offer" -> if (reply?.invoke(JSONObject().put("type", "rtc-offer").put("id", id).put("sdp", value)) != true) stop()
                    "connected" -> { connected = true; synchronized(lock) { queue.clear() }; requestKey() }
                    "keyframe" -> requestKey()
                    "failed" -> stop()
                }
            } }.also { it.start("profile-level-id=$profile;packetization-mode=1;level-asymmetry-allowed=1") }
        } catch (_: Exception) { stop() } catch (_: LinkageError) { stop() }
    }
    private fun drain() {
        repeat(6) {
            val frame = synchronized(lock) { queue.poll(System.nanoTime()) } ?: return@repeat
            if (peer == null || !connected) return@repeat
            if (origin < 0L) origin = frame.nanos
            val timestamp = ((frame.nanos - origin).coerceAtLeast(0) / 1000 * 90 / 1000) and 0xffff_ffffL
            val data = if (frame.key) parameters + frame.bytes else frame.bytes
            if (runCatching { peer?.send(data, timestamp) == true }.getOrDefault(false)) {
                sentFrames++; health?.sent(System.nanoTime())
            }
            else { sendFailures++; synchronized(lock) { queue.clear() }; requestKey() }
        }
        synchronized(lock) {
            draining = false
            if (queue.needsKey) requestKey()
            if (queue.size > 0) { draining = true; execute { drain() } }
        }
    }
    private fun requestKey() {
        val now = System.nanoTime()
        if (now - lastRecovery >= 500_000_000) { lastRecovery = now; recovery?.invoke() }
    }
    private fun checkHealth() {
        if (peer == null) return
        val now = System.nanoTime()
        if (health?.expired(now) == true) stop()
        else reply?.invoke(JSONObject().put("type", "rtc-progress").put("id", id).put("sent", sentFrames))
    }
    private fun stop() {
        val wasDisplaying = displayed
        displayed = false; connected = false; health = null
        (jpeg as? JpegVideoSink)?.setSuspended(false)
        val old = peer; peer = null
        runCatching { old?.close() }
        synchronized(lock) { queue.clear() }
        if (old != null) reply?.invoke(JSONObject().put("type", "rtc-stop").put("id", id))
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
        private val OFFER_IDS = AtomicLong()
    }
}
