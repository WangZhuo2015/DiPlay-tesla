package com.diplay.browser

import com.shilapi.xcertplay.airplay.AudioFormat
import com.shilapi.xcertplay.airplay.AudioStreamId
import com.shilapi.xcertplay.media.RemotePcmOutput
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Independent PCM transport. A fresh browser readiness lease is required for every block. */
class BrowserAudioOutput(private val clock: () -> Long = System::nanoTime) : RemotePcmOutput {
    private val lock = Any()
    private var owner: Any? = null
    private var send: ((ByteArray, Long) -> Boolean)? = null
    private var control: ((JSONObject) -> Boolean)? = null
    private var readyAt = 0L
    private var sequence = 0L
    private var nextStream = 1
    private val streams = HashMap<AudioStreamId, Int>()
    val active get() = synchronized(lock) { owner != null && readyAt != 0L && clock() - readyAt < LEASE_NS }
    fun attach(owner: Any, send: (ByteArray, Long) -> Boolean, control: (JSONObject) -> Boolean) = synchronized(lock) {
        this.owner = owner; this.send = send; this.control = control; readyAt = 0; streams.clear()
    }
    fun ready(owner: Any, enabled: Boolean) = synchronized(lock) {
        if (this.owner === owner) readyAt = if (enabled) clock() else 0
    }
    fun detach(owner: Any) = synchronized(lock) {
        if (this.owner === owner) { this.owner = null; send = null; control = null; readyAt = 0; streams.clear() }
    }
    override fun offer(id: AudioStreamId, format: AudioFormat, pcm: ByteArray, offset: Int, length: Int): Boolean = synchronized(lock) {
        if (!active || format.audioType !in PLAYBACK_TYPES || format.channels !in 1..2 || format.sampleRate !in 8000..96000) return false
        if (offset < 0 || length <= 0 || length > 65516 || offset > pcm.size - length || length % (format.channels * 2) != 0) return false
        val stream = streams.getOrPut(id) { nextStream++ }
        val number = sequence++ and 0xffff_ffffL
        val packet = ByteBuffer.allocate(20 + length).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x31415057).putInt(stream).putInt(format.sampleRate).putShort(format.channels.toShort()).putShort(0)
            .putInt(number.toInt()).put(pcm, offset, length).array()
        // send is a bounded, nonblocking queue operation, never a socket write.
        if (send?.invoke(packet, number) == true) true else { readyAt = 0; false }
    }
    override fun stopped(id: AudioStreamId) = synchronized(lock) {
        streams.remove(id)?.let { control?.invoke(JSONObject().put("type", "audio-stop").put("stream", it)) }
        Unit
    }
    companion object {
        private const val LEASE_NS = 2_500_000_000L
        private val PLAYBACK_TYPES = setOf("media", "default", "alert", "compatibility")
    }
}
