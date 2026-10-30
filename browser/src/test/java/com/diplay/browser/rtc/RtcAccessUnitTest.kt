package com.diplay.browser.rtc

import org.junit.Assert.*
import org.junit.Test

class RtcAccessUnitTest {
    @Test fun avccHeadersIdentifyIdrAndConvertAllNalsWithOneOwnedOutput() {
        val input = byteArrayOf(0, 0, 0, 2, 0x09, 0x10, 0, 0, 0, 3, 0x65, 0x20, 0x30)
        val prefix = byteArrayOf(0, 0, 0, 1, 0x67, 0x42, 0, 0, 0, 1, 0x68, 0x20)
        val unit = RtcAccessUnit.inspect(input)!!
        assertTrue(unit.key)
        assertEquals(input.size, unit.size)
        val output = unit.copyAnnexB(prefix)
        assertArrayEquals(prefix + byteArrayOf(0, 0, 0, 1, 0x09, 0x10, 0, 0, 0, 1, 0x65, 0x20, 0x30), output)
        assertEquals("Inspection/conversion cannot modify the producer's AVCC lengths", 2, input[3].toInt())
        input.fill(0); prefix.fill(0)
        assertEquals("An admitted frame must retain its owned payload", 0x65, output[22].toInt())
        assertEquals("The keyframe's parameter prefix must also be owned", 0x67, output[4].toInt())
    }

    @Test fun avccKeyDetectionUsesNalHeadersNotBytePatternsInsideThePayload() {
        val input = byteArrayOf(0, 0, 0, 7, 0x41, 0, 0, 0, 1, 0x65, 0x20)
        val unit = RtcAccessUnit.inspect(input)!!
        assertFalse(unit.key)
        assertArrayEquals(byteArrayOf(0, 0, 0, 1, 0x41, 0, 0, 0, 1, 0x65, 0x20), unit.copyAnnexB(byteArrayOf()))
    }

    @Test fun annexBRemainsSupportedAndCopiesBorrowedBytesIncludingMixedStartCodes() {
        val input = byteArrayOf(0, 0, 0, 1, 0x09, 0x10, 0, 0, 1, 0x65, 0x20)
        val unit = RtcAccessUnit.inspect(input)!!
        assertTrue(unit.key)
        val output = unit.copyAnnexB(byteArrayOf())
        assertArrayEquals(input, output)
        assertNotSame(input, output)
        input.fill(0)
        assertEquals(0x65, output[9].toInt())
        assertFalse(RtcAccessUnit.inspect(byteArrayOf(0, 0, 0, 1, 0x41, 1))!!.key)
    }

    @Test fun annexBClassifiesMultiSlicePicturesAfterLeadingNonVclUnits() {
        val leading = byteArrayOf(0, 0, 0, 1, 0x09, 0x10, 0, 0, 1, 0x67, 0x42, 0,
            0, 0, 1, 0x68, 0x20, 0, 0, 1, 0x06, 0x20)
        for (type in 1..5) {
            val slice = byteArrayOf(0, 0, 0, 1, (0x60 or type).toByte(), 0x20, 0x30)
            val input = leading + slice + slice
            val unit = RtcAccessUnit.inspect(input)!!
            assertEquals("NAL type $type", type == 5, unit.key)
            assertArrayEquals(input, unit.copyAnnexB(byteArrayOf()))
        }
        assertFalse(RtcAccessUnit.inspect(leading)!!.key)
    }

    @Test fun malformedAvccIsRejectedBeforeAnyConversion() {
        for (input in listOf(
            byteArrayOf(), byteArrayOf(0, 0, 0), byteArrayOf(0, 0, 0, 0, 0x65),
            byteArrayOf(-1, -1, -1, -1, 0x65), byteArrayOf(0x7f, -1, -1, -1, 0x65),
            byteArrayOf(0, 0, 0, 3, 0x65, 1),
            byteArrayOf(0, 0, 0, 2, 0x65, 1, 0),
            byteArrayOf(0, 0, 0, 2, 0x65, 1, 0, 0, 0, 2, 0x41),
        )) assertNull("Malformed unit: ${input.contentToString()}", RtcAccessUnit.inspect(input))
    }

    @Test fun parameterPrefixCountsTowardAdmissionBeforeConversion() {
        val input = ByteArray(RtcFrameQueue.MAX_BYTES).apply { this[3] = 1; this[4] = 0x65 }
        val unit = RtcAccessUnit.inspect(input)!!
        var converted = false
        val queue = RtcFrameQueue()
        assertFalse(queue.offer(unit.size, 0, unit.key, 0, extraBytes = 1) {
            converted = true
            unit.copyAnnexB(byteArrayOf(0))
        })
        assertFalse(converted)
        assertEquals(0, queue.size)
        assertTrue(queue.needsKey)
    }
}
