package com.diplay.browser.rtc

import com.shilapi.xcertplay.airplay.VideoCodec

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
    val rasl: Boolean = false,
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
        fun inspect(source: ByteArray, codec: VideoCodec = VideoCodec.H264): RtcAccessUnit? {
            if (source.size < 5) return null
            // Retain support for the Annex-B input accepted by the existing media helpers.
            if (source[0] == 0.toByte() && source[1] == 0.toByte() &&
                (source[2] == 1.toByte() || source[2] == 0.toByte() && source[3] == 1.toByte())) {
                val type = annexBVclType(source, codec)
                return RtcAccessUnit(source, true, isKey(type, codec), codec == VideoCodec.H265 && type in 8..9)
            }
            var offset = 0
            var key = false
            var rasl = false
            while (source.size - offset >= 4) {
                val length = readLength(source, offset)
                offset += 4
                if (length <= 0 || length > source.size - offset) return null
                if (codec == VideoCodec.H265 && length < 2) return null
                val type = nalType(source[offset], codec)
                if (isKey(type, codec)) key = true
                if (codec == VideoCodec.H265 && type in 8..9) rasl = true
                offset += length
            }
            if (offset != source.size) return null
            return RtcAccessUnit(source, false, key, rasl)
        }

        private fun readLength(bytes: ByteArray, offset: Int): Int =
            ((bytes[offset].toInt() and 255) shl 24) or
                ((bytes[offset + 1].toInt() and 255) shl 16) or
                ((bytes[offset + 2].toInt() and 255) shl 8) or
                (bytes[offset + 3].toInt() and 255)

        private fun nalType(header: Byte, codec: VideoCodec) =
            if (codec == VideoCodec.H265) header.toInt() ushr 1 and 63 else header.toInt() and 31

        private fun isKey(type: Int, codec: VideoCodec) = if (codec == VideoCodec.H265) type in 16..21 else type == 5

        private fun annexBVclType(bytes: ByteArray, codec: VideoCodec): Int {
            var offset = 0
            while (offset + 3 < bytes.size) {
                val prefix = when {
                    bytes[offset] != 0.toByte() || bytes[offset + 1] != 0.toByte() -> 0
                    bytes[offset + 2] == 1.toByte() -> 3
                    bytes[offset + 2] == 0.toByte() && bytes[offset + 3] == 1.toByte() -> 4
                    else -> 0
                }
                if (prefix > 0 && offset + prefix < bytes.size) {
                    if (codec == VideoCodec.H265 && offset + prefix + 1 >= bytes.size) return -1
                    val type = nalType(bytes[offset + prefix], codec)
                    // H.264 7.4.1: an IDR picture cannot contain non-IDR VCL types 1..4.
                    // Each onVideoFrame contains one access unit, so later slices cannot change this.
                    if (codec == VideoCodec.H265 && type in 0..31 || codec == VideoCodec.H264 && type in 1..5) return type
                    offset += prefix + 1
                } else offset++
            }
            return -1
        }
    }
}
