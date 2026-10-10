package com.diplay.browser.rtc

import org.junit.Assert.*
import org.junit.Test

class RtcFrameQueueTest {
    @Test fun overflowAndStaleFramesRequireNewKeyframe() {
        val queue=RtcFrameQueue()
        assertFalse(queue.offer(byteArrayOf(1),0,false,0))
        assertTrue(queue.offer(byteArrayOf(2),0,true,0))
        repeat(5){assertTrue(queue.offer(byteArrayOf(3),it+1L,false,0))}
        assertFalse(queue.offer(byteArrayOf(4),7,false,0));assertNull(queue.poll(0));assertTrue(queue.needsKey)
        assertTrue(queue.offer(byteArrayOf(5),8,true,0))
        assertNull(queue.poll(151_000_000));assertTrue(queue.needsKey)
        assertFalse(queue.offer(byteArrayOf(6),9,false,151_000_000))
        assertTrue(queue.offer(byteArrayOf(7),10,true,151_000_000))
        assertEquals(7,queue.poll(151_000_000)!!.bytes[0].toInt())
    }
    @Test fun queueOwnsFrameCopyAndBoundsMemory() {
        val bytes=byteArrayOf(1);val queue=RtcFrameQueue()
        assertTrue(queue.offer(bytes,0,true,0));bytes[0]=9
        assertEquals(1,queue.poll(0)!!.bytes[0].toInt())
        assertFalse(queue.offer(ByteArray(2*1024*1024+1),0,true,0));assertEquals(0,queue.size)
    }
}
