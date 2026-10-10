package com.diplay.browser

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.net.ProtocolException

class BoundedWebSocketInputTest {
    @Test fun validMaskedTextAndControlFramesPassUnchangedAcrossBulkReads() {
        val bytes=byteArrayOf(0x81.toByte(),0x83.toByte(),1,2,3,4,65,66,67,0x89.toByte(),0x80.toByte(),0,0,0,0)
        assertArrayEquals(bytes,BoundedWebSocketInput(ByteArrayInputStream(bytes)).readBytes())
    }
    @Test fun hugeLengthIsRejectedBeforeReadingPayloadOrMask() {
        for(header in listOf(byteArrayOf(0x81.toByte(),0xfe.toByte(),0xff.toByte(),0xff.toByte()),byteArrayOf(0x81.toByte(),0xff.toByte(),0x7f,0xff.toByte(),0,0,0,0,0,0))) {
            try {BoundedWebSocketInput(ByteArrayInputStream(header)).read();fail("Oversized frame accepted")} catch(_:ProtocolException) {}
        }
    }
    @Test fun unmaskedFragmentedAndBinaryClientFramesAreRejected() {
        for(first in listOf(0x81,0x01,0x82)) {
            val second=if(first==0x81)0 else 0x80
            try {BoundedWebSocketInput(ByteArrayInputStream(byteArrayOf(first.toByte(),second.toByte()))).read();fail("Invalid frame accepted")} catch(_:ProtocolException) {}
        }
    }
}
