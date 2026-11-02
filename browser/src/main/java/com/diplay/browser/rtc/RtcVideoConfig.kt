package com.diplay.browser.rtc

import com.shilapi.xcertplay.airplay.VideoCodec
import com.shilapi.xcertplay.media.MediaCodecSupport
import java.io.ByteArrayOutputStream

/** Codec records are inspected and packetized, never decoded or transcoded on Android. */
internal data class RtcVideoConfig(val codec: VideoCodec, val parameters: ByteArray, val fmtp: String) {
    fun accepts(next: RtcVideoConfig): Boolean {
        if (codec != VideoCodec.H264 || next.codec != VideoCodec.H264) return false
        val offered = fmtp.substringAfter("profile-level-id=").substringBefore(';').toInt(16)
        val source = next.fmtp.substringAfter("profile-level-id=").substringBefore(';').toInt(16)
        return (offered and 0xffff00) == (source and 0xffff00) &&
            (source and 0xff) <= (offered and 0xff) && fmtp.substringAfter(';') == next.fmtp.substringAfter(';')
    }

    companion object {
        private val START = byteArrayOf(0, 0, 0, 1)

        fun parse(codec: VideoCodec, bytes: ByteArray): RtcVideoConfig {
            if (codec == VideoCodec.H264) {
                val (sps, pps) = MediaCodecSupport.avcParameterSets(bytes)
                require(sps.size >= 4 && pps.isNotEmpty()) { "Invalid AVC parameter sets" }
                val profile = sps.sliceArray(1..3).joinToString("") { "%02x".format(it.toInt() and 255) }
                return RtcVideoConfig(codec, START + sps + START + pps,
                    "profile-level-id=$profile;packetization-mode=1;level-asymmetry-allowed=1")
            }
            require(bytes.size >= 23 && bytes[0] == 1.toByte()) { "Invalid HEVC configuration" }
            var cursor = 23
            val found = mutableSetOf<Int>()
            val output = ByteArrayOutputStream()
            fun u16(): Int {
                require(cursor + 2 <= bytes.size) { "Truncated HEVC configuration" }
                return (((bytes[cursor++].toInt() and 255) shl 8) or (bytes[cursor++].toInt() and 255))
            }
            repeat(bytes[22].toInt() and 255) {
                require(cursor < bytes.size)
                val type = bytes[cursor++].toInt() and 63
                repeat(u16()) {
                    val size = u16()
                    require(size >= 2 && size <= bytes.size - cursor) { "Invalid HEVC parameter length" }
                    require((bytes[cursor].toInt() ushr 1 and 63) == type &&
                        bytes[cursor].toInt() and 128 == 0 && bytes[cursor + 1].toInt() and 7 != 0)
                    if (type in 32..34) {
                        found.add(type); output.write(START); output.write(bytes, cursor, size)
                    }
                    cursor += size
                }
            }
            require(cursor == bytes.size && found.containsAll(listOf(32, 33, 34))) { "Missing HEVC VPS/SPS/PPS" }
            val profile = bytes[1].toInt() and 255
            val fmtp = "profile-space=${profile ushr 6};profile-id=${profile and 31};" +
                "tier-flag=${profile ushr 5 and 1};level-id=${bytes[12].toInt() and 255};tx-mode=SRST"
            return RtcVideoConfig(codec, output.toByteArray(), fmtp)
        }
    }
}
