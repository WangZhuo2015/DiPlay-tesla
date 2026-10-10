package com.diplay.browser

import java.nio.ByteBuffer
import org.junit.Assert.assertArrayEquals
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
}
