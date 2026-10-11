package com.diplay.browser.rtc

import com.shilapi.xcertplay.airplay.MediaSink
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class) @Config(sdk=[29])
class BrowserVideoOutputTest {
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
        val jpeg=object:MediaSink{override fun onVideoFrame(type:Int,naluBytes:ByteArray){jpegFrames++}}
        val output=BrowserVideoOutput(jpeg,{}){event->object:RtcPeer{
            override fun start(profile:String){event("offer","test");event("connected","")}
            override fun answer(sdp:String){}
            override fun send(frame:ByteArray,timestamp:Long):Boolean{assertTrue(frame.size>5);sent.countDown();return true}
            override fun close(){}
        }}
        try {
            output.onVideoConfig(110,byteArrayOf(1,0x42,0,0x1f,-1,-31,0,4,0x67,0x42,0,0x1f,1,0,2,0x68,0))
            output.attach(true){data->if(data.getString("type")=="rtc-offer"){id=data.getLong("id");offer.countDown()};true}
            assertTrue(offer.await(2,TimeUnit.SECONDS))
            // Drain the connected callback before injecting a recoverable frame.
            output.command(JSONObject().put("type","rtc-ready").put("id",id))
            val until=System.nanoTime()+2_000_000_000
            while(output.transport!="webrtc" && System.nanoTime()<until)Thread.sleep(5)
            assertEquals("webrtc",output.transport)
            output.onVideoFrame(110,byteArrayOf(0,0,0,1,0x65,1))
            assertTrue("Encoded frame was stranded in the queue",sent.await(2,TimeUnit.SECONDS));assertEquals(0,jpegFrames)
            output.command(JSONObject().put("type","rtc-fallback").put("id",id))
            val fallback=System.nanoTime()+2_000_000_000
            while(output.transport!="jpeg" && System.nanoTime()<fallback)Thread.sleep(5)
            assertEquals("jpeg",output.transport)
            output.onVideoFrame(110,byteArrayOf(0,0,0,1,0x65,1));assertEquals(1,jpegFrames)
        } finally {output.close()}
    }
}
