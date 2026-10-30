package com.diplay.browser.rtc

import com.shilapi.xcertplay.airplay.MediaSink
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.util.ReflectionHelpers
import java.util.concurrent.CountDownLatch
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

@RunWith(RobolectricTestRunner::class) @Config(sdk=[29])
class BrowserVideoOutputTest {
    @Test fun avccFramesKeepOneOwnedAnnexBPayloadAndOnlyIdrCarriesParameters() {
        Fixture(4_000).use { fixture ->
            val idr = byteArrayOf(0, 0, 0, 2, 0x09, 0x10, 0, 0, 0, 3, 0x65, 0x20, 0x30)
            val predictive = byteArrayOf(0, 0, 0, 2, 0x41, 0x40)
            fixture.withWorkerPaused {
                fixture.output.onVideoFrame(110, idr)
                fixture.output.onVideoFrame(110, predictive)
                idr.fill(0); predictive.fill(0)
            }
            val key = fixture.peer.frames.poll(2, TimeUnit.SECONDS)!!
            val next = fixture.peer.frames.poll(2, TimeUnit.SECONDS)!!
            assertArrayEquals(
                byteArrayOf(0, 0, 0, 1, 0x67, 0x42, 0, 0x1f, 0, 0, 0, 1, 0x68, 0,
                    0, 0, 0, 1, 0x09, 0x10, 0, 0, 0, 1, 0x65, 0x20, 0x30), key)
            assertArrayEquals(byteArrayOf(0, 0, 0, 1, 0x41, 0x40), next)
            assertEquals(0, fixture.jpegFrames.get())
        }
    }

    @Test fun aSendFailureThatRecoversBetweenHealthTicksStillInterruptsTheHealthyMinute() {
        Fixture(4_000).use { fixture ->
            fixture.peer.event("failed", ""); fixture.message("rtc-stop")
            fixture.clock.set(5_000_000_000); fixture.tick(); fixture.nextOffer(); fixture.ready()
            for (second in 1..59) {
                fixture.clock.set((5L + second) * 1_000_000_000)
                fixture.feedback(1); fixture.tick()
            }
            fixture.clock.set(64_500_000_000); fixture.peer.acceptFrames = false
            fixture.output.onVideoFrame(110, byteArrayOf(0, 0, 0, 1, 0x65, 1))
            fixture.barrier()
            fixture.clock.set(64_600_000_000); fixture.peer.acceptFrames = true
            fixture.output.onVideoFrame(110, byteArrayOf(0, 0, 0, 1, 0x65, 1))
            assertNotNull(fixture.peer.frames.poll(2, TimeUnit.SECONDS))
            fixture.feedback(2); fixture.barrier()
            fixture.clock.set(65_000_000_000); fixture.tick()
            fixture.peer.event("failed", "")
            assertEquals("An inter-tick send failure must prevent premature healthy reset", 10_000L,
                fixture.message("rtc-stop").getLong("retryAfterMs"))
        }
    }

    @Test fun aHealthyMinuteAfterRecoveryResetsTheNextFailureToFiveSeconds() {
        Fixture(4_000).use { fixture ->
            fixture.peer.event("failed", ""); fixture.message("rtc-stop")
            fixture.clock.set(5_000_000_000); fixture.tick(); fixture.nextOffer(); fixture.ready()
            for (second in 1..60) {
                fixture.clock.set((5L + second) * 1_000_000_000)
                fixture.feedback(1); fixture.tick()
            }
            fixture.peer.event("failed", "")
            assertEquals(5_000L, fixture.message("rtc-stop").getLong("retryAfterMs"))
        }
    }

    @Test fun missingNativeTransportBlocksRetriesRatherThanLoadingItEveryFiveSeconds() {
        val clock = AtomicLong()
        val attempts = AtomicInteger()
        val messages = LinkedBlockingQueue<JSONObject>()
        val output = BrowserVideoOutput(object : MediaSink {}, {}, clock::get) {
            attempts.incrementAndGet()
            throw UnsatisfiedLinkError("No native transport in this test")
        }
        try {
            output.onVideoConfig(110, byteArrayOf(1,0x42,0,0x1f,-1,-31,0,4,0x67,0x42,0,0x1f,1,0,2,0x68,0))
            output.attach(true) { messages.offer(it); true }
            val stop = messages.poll(2, TimeUnit.SECONDS)!!
            assertEquals("native-unavailable", stop.getString("reason"))
            assertTrue(stop.getBoolean("retryBlocked"))
            clock.set(120_000_000_000)
            ReflectionHelpers.getField<ScheduledExecutorService>(output, "worker").submit {
                ReflectionHelpers.callInstanceMethod<Unit>(output, "checkHealth")
            }.get(2, TimeUnit.SECONDS)
            assertEquals(1, attempts.get()); assertEquals("jpeg", output.transport)
        } finally { output.close() }
    }

    @Test fun jpegRemainsAvailableUntilTheCooldownStartsANewPeerAndOldCallbacksStayRetired() {
        Fixture(4_000).use { fixture ->
            val old = fixture.peer
            val oldId = fixture.offer.getLong("id")
            old.event("failed", "")
            assertEquals(5_000L, fixture.message("rtc-stop").getLong("retryAfterMs"))
            fixture.output.onVideoFrame(110, byteArrayOf(0, 0, 0, 1, 0x65, 1))
            assertEquals(1, fixture.jpegFrames.get())
            fixture.clock.set(4_999_999_999); fixture.tick(); fixture.assertNoOffer()
            fixture.clock.set(5_000_000_000); fixture.tick()
            val offer = fixture.nextOffer()
            assertNotEquals(oldId, offer.getLong("id"))
            assertEquals("Negotiation must not hide JPEG", "jpeg", fixture.output.transport)
            fixture.output.onVideoFrame(110, byteArrayOf(0, 0, 0, 1, 0x65, 1))
            assertEquals(2, fixture.jpegFrames.get())
            fixture.ready()
            old.event("failed", "")
            fixture.output.command(JSONObject().put("type", "rtc-fallback").put("id", oldId).put("retryable", false))
            fixture.barrier()
            assertEquals("webrtc", fixture.output.transport)
            fixture.peer.event("failed", "")
            assertEquals("A brief recovery retains the accumulated backoff", 10_000L,
                fixture.message("rtc-stop").getLong("retryAfterMs"))
        }
    }

    @Test fun permanentBrowserRejectionAfterNativeFailureCancelsRetryUntilANewConfiguration() {
        Fixture(4_000).use { fixture ->
            fixture.peer.event("failed", "")
            fixture.message("rtc-stop")
            fixture.output.command(JSONObject().put("type", "rtc-fallback").put("id", fixture.offer.getLong("id"))
                .put("retryable", false))
            assertTrue(fixture.message("rtc-stop").getBoolean("retryBlocked"))
            fixture.clock.set(120_000_000_000); fixture.tick(); fixture.assertNoOffer()
            fixture.output.onVideoConfig(110, byteArrayOf(1,0x42,0,0x20,-1,-31,0,4,0x67,0x42,0,0x20,1,0,2,0x68,0))
            fixture.nextOffer(); fixture.ready()
            assertEquals("webrtc", fixture.output.transport)
        }
    }

    @Test fun detachAndSourceStopCancelPendingRetryWhileReattachStartsImmediately() {
        Fixture(4_000).use { fixture ->
            fixture.peer.event("failed", ""); fixture.message("rtc-stop")
            fixture.output.detach()
            fixture.clock.set(120_000_000_000); fixture.tick(); fixture.assertNoOffer()
            fixture.attach(); fixture.nextOffer(); fixture.ready()
            fixture.peer.event("failed", ""); fixture.message("rtc-stop")
            fixture.output.onScreenStreamActive(110, false)
            fixture.clock.set(240_000_000_000); fixture.tick(); fixture.assertNoOffer()
            fixture.output.onScreenStreamActive(110, true)
            fixture.output.onVideoConfig(110, byteArrayOf(1,0x42,0,0x1f,-1,-31,0,4,0x67,0x42,0,0x1f,1,0,2,0x68,0))
            fixture.nextOffer(); fixture.ready()
            assertEquals("A new source may reuse the prior configuration bytes", "webrtc", fixture.output.transport)
        }
    }
    @Test fun shortNativeDisconnectKeepsLastVideoAndRequestsAFreshKeyframeOnRecovery() {
        Fixture(4_000).use { fixture ->
            assertEquals(4_000, fixture.offer.getLong("recoveryGraceMs"))
            val initialRequests = fixture.keyRequests.get()
            fixture.clock.set(1_000_000_000)
            fixture.peer.event("disconnected", "")
            fixture.barrier()
            assertEquals("webrtc", fixture.output.transport)
            assertEquals(0, fixture.peer.closed.get())
            fixture.clock.set(4_999_999_999)
            assertTrue(fixture.message("rtc-progress").getBoolean("recovering"))
            fixture.peer.event("connected", "")
            fixture.barrier()
            assertEquals("webrtc", fixture.output.transport)
            assertTrue(fixture.keyRequests.get() > initialRequests)
            fixture.output.onVideoFrame(110, byteArrayOf(0, 0, 0, 1, 0x41, 1))
            fixture.output.onVideoFrame(110, byteArrayOf(0, 0, 0, 1, 0x65, 1))
            val frame = fixture.peer.frames.poll(2, TimeUnit.SECONDS)
            assertNotNull("Only a fresh keyframe may resume the stream", frame)
            assertArrayEquals(byteArrayOf(0, 0, 0, 1, 0x65, 1), frame!!.takeLast(6).toByteArray())
            fixture.barrier()
            assertNull("The dependent frame preceding the keyframe must be dropped", fixture.peer.frames.poll())
            assertEquals(0, fixture.jpegFrames.get())
        }
    }

    @Test fun persistentDisconnectionUsesTheChosenDeadlineButTerminalFailureIsImmediate() {
        Fixture(4_000).use { fixture ->
            fixture.clock.set(1_000_000_000)
            fixture.peer.event("disconnected", "")
            fixture.barrier()
            fixture.clock.set(5_000_000_000)
            assertEquals("disconnected-timeout", fixture.message("rtc-stop").getString("reason"))
            assertEquals("jpeg", fixture.output.transport)
            assertEquals(1, fixture.peer.closed.get())
            fixture.output.onVideoFrame(110, byteArrayOf(0, 0, 0, 1, 0x65, 1))
            assertEquals(1, fixture.jpegFrames.get())
        }
        Fixture(30_000).use { fixture ->
            fixture.peer.event("failed", "")
            assertEquals("connection-failed", fixture.message("rtc-stop").getString("reason"))
            assertEquals("jpeg", fixture.output.transport)
            assertEquals(1, fixture.peer.closed.get())
        }
    }

    @Test fun progressReportsRealQueueDropsWithoutCallingLocalSendADeliveredFrame() {
        Fixture(10_000).use { fixture ->
            repeat(3) { fixture.output.onVideoFrame(110, byteArrayOf(0, 0, 0, 1, 0x41, 1)) }
            fixture.barrier()
            val progress = fixture.message("rtc-progress")
            assertEquals(50, progress.getInt("queueBudgetMs"))
            assertEquals(3, progress.getLong("keyframeSkips"))
            assertEquals(0, progress.getLong("sent"))
            assertEquals(0, progress.getInt("queueBytes"))
            assertEquals(0, progress.getInt("queueFrames"))
            assertEquals(0, progress.getLong("expiredFrames"))
            assertEquals(0, progress.getLong("overflowFrames"))
        }
    }

    @Test fun continuouslyExpiredKeyframesFallBackEvenWithFreshUnchangedReceiverFeedback() {
        Fixture(4_000).use { fixture ->
            fixture.output.onVideoFrame(110, byteArrayOf(0, 0, 0, 1, 0x65, 1))
            assertNotNull(fixture.peer.frames.poll(2, TimeUnit.SECONDS))
            fixture.feedback(1); fixture.barrier()
            for (tick in 1..9) {
                fixture.withWorkerPaused {
                    fixture.clock.set(tick * 500_000_000L)
                    fixture.output.onVideoFrame(110, byteArrayOf(0, 0, 0, 1, 0x65, 1))
                    fixture.clock.addAndGet(RtcFrameQueue.MAX_AGE_NS)
                    fixture.feedback(1)
                }
                if (tick < 9) {
                    fixture.barrier()
                    assertEquals("Recovery may use the entire selected grace period", "webrtc", fixture.output.transport)
                }
                assertNull("Every replacement keyframe expired before native send", fixture.peer.frames.poll())
            }
            assertEquals("send-timeout", fixture.message("rtc-stop").getString("reason"))
            assertEquals("jpeg", fixture.output.transport)
            assertEquals(1L, fixture.output.sentFrames)
            assertEquals("Queue expiry is not a failed native send call", 0L, fixture.output.sendFailures)
            fixture.output.onVideoFrame(110, byteArrayOf(0, 0, 0, 1, 0x65, 1))
            assertEquals(1, fixture.jpegFrames.get())
        }
    }

    @Test fun aSuccessfullySentReplacementKeyframeEndsLocalRecoveryAndAllowsAStillScreen() {
        Fixture(4_000).use { fixture ->
            fixture.output.onVideoFrame(110, byteArrayOf(0, 0, 0, 1, 0x65, 1))
            assertNotNull(fixture.peer.frames.poll(2, TimeUnit.SECONDS))
            fixture.feedback(1); fixture.barrier()
            fixture.withWorkerPaused {
                fixture.clock.set(500_000_000)
                fixture.output.onVideoFrame(110, byteArrayOf(0, 0, 0, 1, 0x65, 1))
                fixture.clock.addAndGet(RtcFrameQueue.MAX_AGE_NS)
                fixture.feedback(1)
            }
            fixture.barrier()
            assertNull(fixture.peer.frames.poll())
            fixture.clock.set(1_000_000_000)
            fixture.output.onVideoFrame(110, byteArrayOf(0, 0, 0, 1, 0x65, 1))
            assertNotNull(fixture.peer.frames.poll(2, TimeUnit.SECONDS))
            fixture.feedback(2); fixture.barrier()
            for (second in 2..120) {
                fixture.clock.set(second * 1_000_000_000L)
                fixture.feedback(2); fixture.barrier()
            }
            val progress = fixture.message("rtc-progress") { it.getLong("sent") == 2L }
            assertFalse("A still source has no continuing local send failure", progress.getBoolean("recovering"))
            assertEquals(1L, progress.getLong("expiredFrames"))
            assertEquals("webrtc", fixture.output.transport)
            assertEquals(0, fixture.peer.closed.get())
            assertEquals(0, fixture.jpegFrames.get())
        }
    }

    private class FakePeer(val event: (String, String) -> Unit) : RtcPeer {
        val answers = LinkedBlockingQueue<String>()
        val frames = LinkedBlockingQueue<ByteArray>()
        val closed = AtomicInteger()
        @Volatile var beforeAnswer: ((String) -> Unit)? = null
        @Volatile var acceptFrames = true
        override fun start(profile: String) { event("offer", "test"); event("connected", "") }
        override fun answer(sdp: String) { beforeAnswer?.invoke(sdp); answers.offer(sdp) }
        override fun send(frame: ByteArray, timestamp: Long): Boolean {
            if (!acceptFrames) return false
            frames.offer(frame); return true
        }
        override fun close() { closed.incrementAndGet() }
    }

    private class Fixture(graceMs: Long) : java.io.Closeable {
        val clock = AtomicLong()
        val jpegFrames = AtomicInteger()
        val keyRequests = AtomicInteger()
        private val messages = LinkedBlockingQueue<JSONObject>()
        private lateinit var currentPeer: FakePeer
        val peer get() = currentPeer
        val output = BrowserVideoOutput(object : MediaSink {
            override fun onVideoFrame(type: Int, naluBytes: ByteArray) { jpegFrames.incrementAndGet() }
        }, {}, clock::get) { event -> FakePeer(event).also { currentPeer = it } }
        val offer: JSONObject
        private var id: Long
        init {
            output.setVideoRecoveryHandler(110) { keyRequests.incrementAndGet() }
            output.onVideoConfig(110, byteArrayOf(1,0x42,0,0x1f,-1,-31,0,4,0x67,0x42,0,0x1f,1,0,2,0x68,0))
            output.attach(true, graceMs) { messages.offer(it); true }
            offer = message("rtc-offer")
            id = offer.getLong("id")
            output.command(JSONObject().put("type", "rtc-ready").put("id", id))
            barrier()
            assertEquals("webrtc", output.transport)
        }
        fun barrier() {
            output.command(JSONObject().put("type", "rtc-answer").put("id", id).put("sdp", "barrier"))
            assertEquals("barrier", peer.answers.poll(2, TimeUnit.SECONDS))
        }
        fun tick() {
            ReflectionHelpers.getField<ScheduledExecutorService>(output, "worker").submit {
                ReflectionHelpers.callInstanceMethod<Unit>(output, "checkHealth")
            }.get(2, TimeUnit.SECONDS)
        }
        fun nextOffer(): JSONObject = message("rtc-offer").also { id = it.getLong("id") }
        fun ready() {
            output.command(JSONObject().put("type", "rtc-ready").put("id", id))
            barrier()
        }
        fun attach() = output.attach(true, 4_000) { messages.offer(it); true }
        fun assertNoOffer() { assertFalse(messages.any { it.getString("type") == "rtc-offer" }) }
        fun feedback(decoded: Long) {
            output.command(JSONObject().put("type", "rtc-feedback").put("id", id).put("decoded", decoded))
        }
        fun withWorkerPaused(task: () -> Unit) {
            val entered = CountDownLatch(1)
            val resume = CountDownLatch(1)
            peer.beforeAnswer = { sdp ->
                if (sdp == "hold") {
                    entered.countDown()
                    check(resume.await(2, TimeUnit.SECONDS)) { "Test did not release the RTC worker" }
                }
            }
            try {
                output.command(JSONObject().put("type", "rtc-answer").put("id", id).put("sdp", "hold"))
                assertTrue("RTC worker did not enter the test gate", entered.await(2, TimeUnit.SECONDS))
                task()
            } finally {
                peer.beforeAnswer = null
                resume.countDown()
            }
            assertEquals("hold", peer.answers.poll(2, TimeUnit.SECONDS))
        }
        fun message(type: String, accept: (JSONObject) -> Boolean = { true }): JSONObject {
            val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3)
            while (true) {
                val remaining = deadline - System.nanoTime()
                if (remaining <= 0) throw AssertionError("Missing $type")
                val next = messages.poll(remaining, TimeUnit.NANOSECONDS) ?: throw AssertionError("Missing $type")
                if (next.getString("type") == type && accept(next)) return next
            }
        }
        override fun close() = output.close()
    }

    @Test fun staleCommandsFromPreviousOutputCannotStopReconnectedVideo() {
        val oldOffer = CountDownLatch(1)
        val newOffer = CountDownLatch(1)
        val commandsDrained = CountDownLatch(1)
        var oldId = 0L
        var newId = 0L
        fun output() = BrowserVideoOutput(object : MediaSink {}, {}) { event ->
            object : RtcPeer {
                override fun start(profile: String) {
                    event("offer", "test")
                    event("connected", "")
                }
                override fun answer(sdp: String) { commandsDrained.countDown() }
                override fun send(frame: ByteArray, timestamp: Long) = true
                override fun close() {}
            }
        }
        val old = output()
        val next = output()
        val config = byteArrayOf(1,0x42,0,0x1f,-1,-31,0,4,0x67,0x42,0,0x1f,1,0,2,0x68,0)
        try {
            old.onVideoConfig(110, config)
            old.attach(true) { data ->
                if (data.getString("type") == "rtc-offer") {
                    oldId = data.getLong("id")
                    oldOffer.countDown()
                }
                true
            }
            assertTrue(oldOffer.await(2, TimeUnit.SECONDS))
            next.onVideoConfig(110, config)
            next.attach(true) { data ->
                if (data.getString("type") == "rtc-offer") {
                    newId = data.getLong("id")
                    newOffer.countDown()
                }
                true
            }
            assertTrue(newOffer.await(2, TimeUnit.SECONDS))
            assertNotEquals(oldId, newId)
            old.close()
            next.command(JSONObject().put("type", "rtc-ready").put("id", newId))
            next.command(JSONObject().put("type", "rtc-fallback").put("id", oldId))
            next.command(JSONObject().put("type", "rtc-answer").put("id", newId).put("sdp", "test"))
            assertTrue(commandsDrained.await(2, TimeUnit.SECONDS))
            assertEquals("webrtc", next.transport)
        } finally {
            old.close()
            next.close()
        }
    }

    @Test fun videoSwitchWaitsForBrowserReadinessAndRetainsEncodedFrames() {
        val sent=CountDownLatch(1);val offer=CountDownLatch(1);var id=0L;var jpegFrames=0
        val firstFrame=CountDownLatch(1);val rendered=AtomicInteger()
        var jpegDiagnostic: ((String) -> Unit)? = null
        val jpeg=object:MediaSink{
            override fun onVideoFrame(type:Int,naluBytes:ByteArray){jpegFrames++}
            override fun setVideoDiagnosticHandler(type:Int,handler:(String)->Unit){jpegDiagnostic=handler}
        }
        val output=BrowserVideoOutput(jpeg,{}){event->object:RtcPeer{
            override fun start(profile:String){event("offer","test");event("connected","")}
            override fun answer(sdp:String){}
            override fun send(frame:ByteArray,timestamp:Long):Boolean{assertTrue(frame.size>5);sent.countDown();return true}
            override fun close(){}
        }}
        try {
            output.setVideoDiagnosticHandler(110) { if (it == "first frame rendered") { rendered.incrementAndGet(); firstFrame.countDown() } }
            output.onVideoConfig(110,byteArrayOf(1,0x42,0,0x1f,-1,-31,0,4,0x67,0x42,0,0x1f,1,0,2,0x68,0))
            output.attach(true){data->if(data.getString("type")=="rtc-offer"){id=data.getLong("id");offer.countDown()};true}
            assertTrue(offer.await(2,TimeUnit.SECONDS))
            assertEquals("An offer alone does not prove playback",0,rendered.get())
            // Drain the connected callback before injecting a recoverable frame.
            output.command(JSONObject().put("type","rtc-ready").put("id",id))
            val until=System.nanoTime()+2_000_000_000
            while(output.transport!="webrtc" && System.nanoTime()<until)Thread.sleep(5)
            assertEquals("webrtc",output.transport)
            assertTrue("Browser playback must reset the core wireless retry budget",firstFrame.await(2,TimeUnit.SECONDS))
            output.onVideoFrame(110,byteArrayOf(0,0,0,1,0x65,1))
            assertTrue("Encoded frame was stranded in the queue",sent.await(2,TimeUnit.SECONDS));assertEquals(0,jpegFrames)
            output.command(JSONObject().put("type","rtc-fallback").put("id",id))
            val fallback=System.nanoTime()+2_000_000_000
            while(output.transport!="jpeg" && System.nanoTime()<fallback)Thread.sleep(5)
            assertEquals("jpeg",output.transport)
            output.onVideoFrame(110,byteArrayOf(0,0,0,1,0x65,1));assertEquals(1,jpegFrames)
            jpegDiagnostic?.invoke("first frame rendered")
            assertEquals("JPEG fallback must not duplicate the session playback proof",1,rendered.get())
        } finally {output.close()}
    }
}
