package com.shilapi.xcertplay.media

import com.shilapi.xcertplay.airplay.AudioFormat
import com.shilapi.xcertplay.airplay.AudioStreamId

/** Optional playback endpoint. Never block the decoder on network I/O. PCM is signed S16LE.
 * Returning true transfers this block to the endpoint; false preserves local playback. */
interface RemotePcmOutput {
    fun offer(id: AudioStreamId, format: AudioFormat, pcm: ByteArray, offset: Int, length: Int): Boolean
    fun stopped(id: AudioStreamId)
}
