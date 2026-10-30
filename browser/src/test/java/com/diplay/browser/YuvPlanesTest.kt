package com.diplay.browser

import java.nio.ByteBuffer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Test

class YuvPlanesTest {
    @Test fun convertsCroppedPaddedPlanarImageWithBufferOffsets() {
        val y = ByteBuffer.wrap(byteArrayOf(99, 1,2,3,4,0,0, 5,6,7,8,0,0, 9,10,11,12,0,0, 13,14,15,16)).apply { position(1) }
        val u = ByteBuffer.wrap(byteArrayOf(21,22,0,31,32))
        val v = ByteBuffer.wrap(byteArrayOf(41,42,0,51,52))
        val result = YuvPlanes.nv21(listOf(YuvPlanes.Plane(y,6,1),YuvPlanes.Plane(u,3,1),YuvPlanes.Plane(v,3,1)),2,2,2,2)
        assertArrayEquals(byteArrayOf(11,12,15,16,52,32), result)
    }
    @Test fun supportsInterleavedChromaPixelStride() {
        val y = ByteBuffer.wrap(byteArrayOf(1,2,3,4,5,6,7,8))
        val uv = byteArrayOf(21,41,22,42)
        val result = YuvPlanes.nv21(listOf(YuvPlanes.Plane(y,4,1),
            YuvPlanes.Plane(ByteBuffer.wrap(uv),4,2),
            YuvPlanes.Plane(ByteBuffer.wrap(uv).apply { position(1) },4,2)),0,0,4,2)
        assertArrayEquals(byteArrayOf(1,2,3,4,5,6,7,8,41,21,42,22), result)
    }
    @Test fun copiesDirectCroppedRowsIntoReusableStorageWithoutMovingPlanePositions() {
        val y = ByteBuffer.allocateDirect(25).apply {
            put(byteArrayOf(99,1,2,3,4,0,0,5,6,7,8,0,0,9,10,11,12,0,0,13,14,15,16))
            limit(23); position(1)
        }
        val u = ByteBuffer.allocateDirect(5).apply { put(byteArrayOf(21,22,0,31,32)); flip() }
        val v = ByteBuffer.allocateDirect(5).apply { put(byteArrayOf(41,42,0,51,52)); flip() }
        val target = ByteArray(6)
        val planes = listOf(YuvPlanes.Plane(y,6,1), YuvPlanes.Plane(u,3,1), YuvPlanes.Plane(v,3,1))
        assertSame(target, YuvPlanes.nv21(planes,2,2,2,2,target))
        assertArrayEquals(byteArrayOf(11,12,15,16,52,32),target)
        assertEquals(1,y.position())
        assertEquals(23,y.limit())
        assertEquals(0,u.position())
        assertEquals(0,v.position())
        y.put(15,99)
        YuvPlanes.nv21(planes,2,2,2,2,target)
        assertArrayEquals(byteArrayOf(99,12,15,16,52,32),target)
    }
    @Test fun retainsStridedLumaFallbackAndRejectsShortDestination() {
        val planes = listOf(YuvPlanes.Plane(ByteBuffer.wrap(byteArrayOf(1,0,2,0,3,0,4)),4,2),
            YuvPlanes.Plane(ByteBuffer.wrap(byteArrayOf(5)),1,1),
            YuvPlanes.Plane(ByteBuffer.wrap(byteArrayOf(6)),1,1))
        assertArrayEquals(byteArrayOf(1,2,3,4,6,5), YuvPlanes.nv21(planes,0,0,2,2))
        assertThrows(IllegalArgumentException::class.java) { YuvPlanes.nv21(planes,0,0,2,2,ByteArray(5)) }
    }
}
