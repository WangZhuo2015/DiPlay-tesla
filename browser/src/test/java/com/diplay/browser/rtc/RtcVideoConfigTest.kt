package com.diplay.browser.rtc

import com.shilapi.xcertplay.airplay.VideoCodec
import org.junit.Assert.*
import org.junit.Test

internal object HevcTestData {
    fun config(): ByteArray {
        val header = ByteArray(23).apply { this[0] = 1; this[1] = 1; this[12] = 120; this[21] = 3; this[22] = 3 }
        return header + (32..34).flatMap { type ->
            listOf(type.toByte(), 0, 1, 0, 3, (type shl 1).toByte(), 1, 0x80.toByte())
        }.toByteArray()
    }
    fun frame(type: Int) = byteArrayOf(0, 0, 0, 1, (type shl 1).toByte(), 1, 0x80.toByte())
}

class RtcVideoConfigTest {
    @Test fun hevcExtractsAllParameterSetsAndAdvertisesTheActualProfileTierLevel() {
        val parsed = RtcVideoConfig.parse(VideoCodec.H265, HevcTestData.config())
        assertEquals(VideoCodec.H265, parsed.codec)
        assertArrayEquals(HevcTestData.frame(32) + HevcTestData.frame(33) + HevcTestData.frame(34), parsed.parameters)
        assertEquals("profile-space=0;profile-id=1;tier-flag=0;level-id=120;tx-mode=SRST", parsed.fmtp)
    }

    @Test fun truncatedMissingAndMislabelledHevcParametersCannotStartAPeer() {
        val valid = HevcTestData.config()
        val malformed = (0 until valid.size).map { valid.copyOf(it) } + listOf(
            valid + byteArrayOf(0), valid.copyOf().apply { this[28] = 0x42 },
            valid.copyOf().apply { this[29] = 0 }, valid.copyOf().apply { this[22] = 2 },
        )
        for (bytes in malformed) {
            try { RtcVideoConfig.parse(VideoCodec.H265, bytes); fail("Accepted malformed hvcC") }
            catch (_: IllegalArgumentException) { }
        }
    }

    @Test fun hevcRandomAccessAndRaslAreDistinguishedFromAvcIdrHeaders() {
        for (type in 0..40) {
            val frame = RtcAccessUnit.inspect(HevcTestData.frame(type), VideoCodec.H265)!!
            assertEquals("NAL $type", type in 16..21, frame.key)
            assertEquals(type in 8..9, frame.rasl)
        }
        assertFalse(RtcAccessUnit.inspect(HevcTestData.frame(5), VideoCodec.H265)!!.key)
        assertTrue(RtcAccessUnit.inspect(byteArrayOf(0,0,0,1,0x65,1))!!.key)
    }

    @Test fun lengthPrefixedHevcPreservesPayloadWhenAddingParameterSets() {
        val raw = HevcTestData.frame(19).drop(4).toByteArray()
        val unit = RtcAccessUnit.inspect(byteArrayOf(0,0,0,raw.size.toByte()) + raw, VideoCodec.H265)!!
        assertTrue(unit.key)
        assertArrayEquals(HevcTestData.frame(32) + HevcTestData.frame(19), unit.copyAnnexB(HevcTestData.frame(32)))
    }
}
