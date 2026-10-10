package com.diplay.browser

import java.nio.ByteBuffer

/** Copies cropped, padded planar or interleaved YUV420 into NV21 for JPEG encoding. */
internal object YuvPlanes {
    data class Plane(val bytes: ByteBuffer, val rowStride: Int, val pixelStride: Int)
    fun nv21(planes: List<Plane>, left: Int, top: Int, width: Int, height: Int): ByteArray {
        require(planes.size == 3 && width > 0 && height > 0 && width % 2 == 0 && height % 2 == 0)
        val result = ByteArray(width * height * 3 / 2)
        planes.forEachIndexed { index, plane ->
            val shift = if (index == 0) 0 else 1
            val columns = width shr shift
            val rows = height shr shift
            val cropX = left shr shift
            val cropY = top shr shift
            val base = plane.bytes.position()
            var target = if (index == 0) 0 else width * height + if (index == 1) 1 else 0
            val step = if (index == 0) 1 else 2
            repeat(rows) { y ->
                val row = base + (y + cropY) * plane.rowStride + cropX * plane.pixelStride
                repeat(columns) { x ->
                    result[target] = plane.bytes.get(row + x * plane.pixelStride)
                    target += step
                }
            }
        }
        return result
    }
}
