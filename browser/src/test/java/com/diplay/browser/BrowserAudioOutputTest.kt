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
        assertEquals(44100,header.int); assertEquals(2,header.short.toInt())
        assertEquals(1,header.short.toInt());assertEquals(0,header.int)
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
    @Test fun everyPlaybackTypeCarriesItsRoleWithoutChangingHeaderOrPcm() {
        val output = BrowserAudioOutput { 1L }
        val owner = Any()
        val packets = mutableListOf<ByteArray>()
        val numbers = mutableListOf<Long>()
        output.attach(owner, { bytes, number -> packets.add(bytes); numbers.add(number); true }, { true })
        output.ready(owner, true)
        // Deliberately disagree with the format: neither this label nor the wire stream ID is a role.
        val id = AudioStreamId(100, "telephony")
        val pcm = byteArrayOf(99, 98, 0, 0x7f, 0x80.toByte(), 0xff.toByte(), 97, 96)
        var sequence = 0
        for ((audioType, role) in listOf("media" to 1, "default" to 2, "alert" to 2, "compatibility" to 2)) {
            for (codec in AudioCodecKind.values()) {
                for (channels in 1..2) {
                    for (rate in listOf(8000, 44100, 48000, 96000)) {
                        val format = AudioFormat(codec, rate, channels, 100, audioType)
                        assertTrue(output.offer(id, format, pcm, 2, 4))
                        val packet = packets.last()
                        assertEquals(24, packet.size)
                        val header = ByteBuffer.wrap(packet).order(ByteOrder.LITTLE_ENDIAN)
                        assertEquals(0x31415057, header.int)
                        assertEquals(1, header.int)
                        assertEquals(rate, header.int)
                        assertEquals(channels, header.short.toInt())
                        assertEquals(role, header.short.toInt() and 0xffff)
                        assertEquals(role, packet[14].toInt() and 0xff)
                        assertEquals(0, packet[15].toInt())
                        assertEquals(sequence, header.int)
                        assertEquals(20, header.position())
                        assertArrayEquals(pcm.copyOfRange(2, 6), packet.copyOfRange(20, packet.size))
                        assertEquals(sequence.toLong(), numbers.last())
                        sequence++
                    }
                }
            }
        }
        assertArrayEquals(byteArrayOf(99, 98, 0, 0x7f, 0x80.toByte(), 0xff.toByte(), 97, 96), pcm)
        pcm.fill(42)
        assertTrue(packets.all { it.copyOfRange(20, 24).contentEquals(byteArrayOf(0, 0x7f, 0x80.toByte(), 0xff.toByte())) })
    }
    @Test fun musicAndGuidanceRolesDoNotDependOnStreamCreationOrder() {
        for (types in listOf(listOf("media", "default"), listOf("default", "media"))) {
            val output = BrowserAudioOutput { 1L }
            val owner = Any()
            val packets = mutableListOf<ByteArray>()
            output.attach(owner, { bytes, _ -> packets.add(bytes); true }, { true })
            output.ready(owner, true)
            repeat(2) {
                for ((index, type) in types.withIndex()) {
                    val format = AudioFormat(AudioCodecKind.LPCM, 48000, 2, 100, type)
                    assertTrue(output.offer(AudioStreamId(100, type), format, ByteArray(4), 0, 4))
                    val header = ByteBuffer.wrap(packets.last()).order(ByteOrder.LITTLE_ENDIAN)
                    assertEquals(index + 1, header.getInt(4))
                    assertEquals(if (type == "media") 1 else 2, header.getShort(14).toInt())
                }
            }
        }
    }
    @Test fun rolesSurviveStreamStopReattachmentAndOutputRecreation() {
        repeat(2) {
            val output = BrowserAudioOutput { 1L }
            var owner = Any()
            val packets = mutableListOf<ByteArray>()
            val stops = mutableListOf<Int>()
            fun attach() {
                output.attach(owner, { bytes, _ -> packets.add(bytes); true }, {
                    assertEquals("audio-stop", it.getString("type"))
                    stops.add(it.getInt("stream")); true
                })
                output.ready(owner, true)
            }
            attach()
            val id = AudioStreamId(100, "media")
            fun offer(type: String, expectedStream: Int, expectedRole: Int) {
                val format = AudioFormat(AudioCodecKind.LPCM, 48000, 2, 100, type)
                assertTrue(output.offer(id, format, byteArrayOf(1, 2, 3, 4), 0, 4))
                val header = ByteBuffer.wrap(packets.last()).order(ByteOrder.LITTLE_ENDIAN)
                assertEquals(expectedStream, header.getInt(4))
                assertEquals(expectedRole, header.getShort(14).toInt())
                assertArrayEquals(byteArrayOf(1, 2, 3, 4), packets.last().copyOfRange(20, 24))
            }
            offer("media", 1, 1)
            output.stopped(id)
            offer("default", 2, 2)
            output.stopped(id)
            offer("media", 3, 1)
            assertEquals(listOf(1, 2), stops)
            output.detach(owner)
            owner = Any()
            attach()
            offer("alert", 4, 2)
            offer("media", 4, 1)
            offer("compatibility", 4, 2)
        }
    }
    @Test fun callsSiriAndUnknownTypesStayLocalRegardlessOfStreamLabel() {
        val output = BrowserAudioOutput { 1L }
        val owner = Any()
        val packets = mutableListOf<ByteArray>()
        output.attach(owner, { bytes, _ -> packets.add(bytes); true }, { fail("Excluded stream sent a control message"); false })
        output.ready(owner, true)
        for (type in listOf("telephony", "speechRecognition", "speechrecognition", "Siri", "assistant", "unknown", "", "Media")) {
            val format = AudioFormat(AudioCodecKind.LPCM, 16000, 1, 100, type)
            val id = AudioStreamId(100, "media")
            assertFalse(type, output.offer(id, format, ByteArray(4), 0, 4))
            output.stopped(id)
            assertTrue(output.active)
        }
        assertTrue(packets.isEmpty())
        val format = AudioFormat(AudioCodecKind.LPCM, 48000, 2, 100, "media")
        assertTrue(output.offer(AudioStreamId(100, "media"), format, ByteArray(4), 0, 4))
        val header = ByteBuffer.wrap(packets.single()).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals(1, header.getInt(4))
        assertEquals(0, header.getInt(16))
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
