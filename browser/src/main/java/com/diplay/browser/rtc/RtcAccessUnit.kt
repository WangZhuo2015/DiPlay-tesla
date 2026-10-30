package com.diplay.browser.rtc

/**
 * Inspects one borrowed access unit without copying its payload. ScreenStream normally supplies
 * Annex B; the first VCL header determines IDR status without scanning its compressed slice data.
 * AVCC is also accepted using its NAL lengths to skip payloads.
 * The caller must copy an accepted unit before returning the borrowed bytes to its producer.
 */
internal class RtcAccessUnit private constructor(
    private val source: ByteArray,
    private val annexB: Boolean,
    val key: Boolean,
) {
    val size get() = source.size

    /** One owned allocation, including the parameter sets needed by an RTC keyframe. */
    fun copyAnnexB(prefix: ByteArray): ByteArray {
        val output = ByteArray(prefix.size + source.size)
        prefix.copyInto(output)
        source.copyInto(output, prefix.size)
        if (!annexB) {
            var offset = 0
            while (offset < source.size) {
                val length = readLength(source, offset)
                val start = prefix.size + offset
                output[start] = 0
                output[start + 1] = 0
                output[start + 2] = 0
                output[start + 3] = 1
                offset += 4 + length
            }
        }
        return output
    }

    companion object {
        fun inspect(source: ByteArray): RtcAccessUnit? {
            if (source.size < 5) return null
            // Retain support for the Annex-B input accepted by the existing media helpers.
            if (source[0] == 0.toByte() && source[1] == 0.toByte() &&
                source[2] == 0.toByte() && source[3] == 1.toByte()) {
                return RtcAccessUnit(source, true, isAnnexBKeyframe(source))
            }
            var offset = 0
            var key = false
            while (source.size - offset >= 4) {
                val length = readLength(source, offset)
                offset += 4
                if (length <= 0 || length > source.size - offset) return null
                if (source[offset].toInt() and 31 == 5) key = true
                offset += length
            }
            if (offset != source.size) return null
            return RtcAccessUnit(source, false, key)
        }

        private fun readLength(bytes: ByteArray, offset: Int): Int =
            ((bytes[offset].toInt() and 255) shl 24) or
                ((bytes[offset + 1].toInt() and 255) shl 16) or
                ((bytes[offset + 2].toInt() and 255) shl 8) or
                (bytes[offset + 3].toInt() and 255)

        private fun isAnnexBKeyframe(bytes: ByteArray): Boolean {
            var offset = 0
            while (offset + 3 < bytes.size) {
                val prefix = when {
                    bytes[offset] != 0.toByte() || bytes[offset + 1] != 0.toByte() -> 0
                    bytes[offset + 2] == 1.toByte() -> 3
                    bytes[offset + 2] == 0.toByte() && bytes[offset + 3] == 1.toByte() -> 4
                    else -> 0
                }
                if (prefix > 0 && offset + prefix < bytes.size) {
                    val type = bytes[offset + prefix].toInt() and 31
                    // H.264 7.4.1: an IDR picture cannot contain non-IDR VCL types 1..4.
                    // Each onVideoFrame contains one access unit, so later slices cannot change this.
                    if (type in 1..5) return type == 5
                    offset += prefix + 1
                } else offset++
            }
            return false
        }
    }
}
