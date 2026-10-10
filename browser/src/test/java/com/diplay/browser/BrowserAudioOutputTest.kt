package com.diplay.browser

import com.shilapi.xcertplay.airplay.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import com.shilapi.xcertplay.media.AndroidMediaSink
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class) @Config(sdk = [29])
class BrowserAudioOutputTest {
    @Test fun readinessExpiresAndPacketRetainsStreamRateChannelsAndPcm() {
        var now = 1L
        val output = BrowserAudioOutput { now }
        val owner = Any()
        val packets = mutableListOf<ByteArray>()
        val id = AudioStreamId(100,"media")
        val format = AudioFormat(AudioCodecKind.AAC_LC,44100,2,100)
        val pcm = byteArrayOf(1,2,3,4)
        output.attach(owner,{bytes,_->packets.add(bytes);true},{true})
        assertFalse(output.offer(id,format,pcm,0,4))
        output.ready(Any(),true)
        assertFalse(output.active)
        output.ready(owner,true)
        assertTrue(output.offer(id,format,pcm,0,4))
        val header = ByteBuffer.wrap(packets.single()).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals(0x31415057,header.int); assertEquals(1,header.int)
        assertEquals(44100,header.int); assertEquals(2,header.short.toInt());header.short;header.int
        val payload = ByteArray(header.remaining());header.get(payload);assertArrayEquals(pcm,payload)
        pcm[0]=9;assertEquals(1,packets[0][20].toInt())
        now+=2_500_000_000L
        assertFalse(output.offer(id,format,pcm,0,4))
        output.ready(owner,true);assertTrue(output.active)
        output.detach(owner);assertFalse(output.active)
    }
    @Test fun callsStayLocalAndBackpressureRevokesReadiness() {
        val output=BrowserAudioOutput{1};val owner=Any()
        output.attach(owner,{_,_->false},{true});output.ready(owner,true)
        val call=AudioFormat(AudioCodecKind.LPCM,16000,1,100,"telephony")
        assertFalse(output.offer(AudioStreamId(100,"telephony"),call,ByteArray(4),0,4))
        assertTrue(output.active)
        assertFalse(output.offer(AudioStreamId(100,"media"),call.copy(audioType="media"),ByteArray(4),0,4))
        assertFalse(output.active)
    }
    @Test fun realMediaSinkHandsDecodedLittleEndianPcmToTheBrowserRoute() {
        val output=BrowserAudioOutput();val owner=Any();val latch=CountDownLatch(1)
        var received:ByteArray?=null
        output.attach(owner,{bytes,_->received=bytes;latch.countDown();true},{true});output.ready(owner,true)
        val sink=AndroidMediaSink(context=RuntimeEnvironment.getApplication())
        val id=AudioStreamId(100,"media");val format=AudioFormat(AudioCodecKind.LPCM,48000,2,100)
        try {
            sink.setPcmOutput(output);sink.onAudioStarted(id,format,0)
            sink.onAudioRtp(id,format,ByteArray(12)+byteArrayOf(0x12,0x34,0x56,0x78),0)
            assertTrue("PCM was not delivered by the core decoder worker",latch.await(3,TimeUnit.SECONDS))
            assertArrayEquals(byteArrayOf(0x34,0x12,0x78,0x56),received!!.copyOfRange(20,24))
            output.detach(owner);assertFalse(output.active)
        } finally {sink.close()}
    }
}
