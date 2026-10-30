package com.diplay.browser

import java.nio.ByteBuffer

/** Copies cropped, padded planar or interleaved YUV420 into NV21 for JPEG encoding. */
internal object YuvPlanes {
    data class Plane(val bytes: ByteBuffer, val rowStride: Int, val pixelStride: Int)
    fun nv21(planes: List<Plane>, left: Int, top: Int, width: Int, height: Int,
        result: ByteArray = ByteArray(width * height * 3 / 2)): ByteArray {
        require(planes.size == 3 && left >= 0 && top >= 0 && width > 0 && height > 0 && width % 2 == 0 && height % 2 == 0)
        require(result.size >= width.toLong() * height * 3 / 2)
        planes.forEachIndexed { index, plane ->
            require(plane.rowStride > 0 && plane.pixelStride > 0)
            val shift = if (index == 0) 0 else 1
            val columns = width shr shift
            val rows = height shr shift
            val cropX = left shr shift
            val cropY = top shr shift
            val base = plane.bytes.position()
            var target = if (index == 0) 0 else width * height + if (index == 1) 1 else 0
            val step = if (index == 0) 1 else 2
            // Luma is normally contiguous. A bulk row copy avoids per-pixel buffer
            // accesses, while retaining padding and crop support.
            val contiguous = if (step == 1 && plane.pixelStride == 1) plane.bytes.duplicate() else null
            repeat(rows) { y ->
                val row = base + (y + cropY) * plane.rowStride + cropX * plane.pixelStride
                if (contiguous != null) {
                    contiguous.position(row)
                    contiguous.get(result, target, columns)
                    target += columns
                } else {
                    repeat(columns) { x ->
                        result[target] = plane.bytes.get(row + x * plane.pixelStride)
                        target += step
                    }
                }
            }
        }
        return result
    }
}
