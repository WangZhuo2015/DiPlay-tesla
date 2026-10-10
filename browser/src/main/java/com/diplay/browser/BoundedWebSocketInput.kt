package com.diplay.browser

import java.io.EOFException
import java.io.InputStream
import java.net.ProtocolException

/** Reject oversized/fragmented client frames before NanoWSD allocates their payload. */
internal class BoundedWebSocketInput(private val input: InputStream) : InputStream() {
    private var header = ByteArray(0)
    private var position = 0
    private var remaining = 0
    private fun byte(): Int = input.read().also { if (it < 0) throw EOFException() }
    private fun next(): Boolean {
        val first = input.read()
        if (first < 0) return false
        val second = byte()
        val opcode = first and 15
        if (first and 0xf0 != 0x80 || opcode !in setOf(1, 8, 9, 10) || second and 0x80 == 0) throw ProtocolException("Invalid client frame")
        val bytes = ArrayList<Int>(); bytes.add(first); bytes.add(second)
        var length = (second and 127).toLong()
        if (length >= 126) {
            val count = if (length == 126L) 2 else 8
            length = 0
            repeat(count) {
                val value = byte(); bytes.add(value)
                if (length > 32768 / 256) throw ProtocolException("Client frame too large")
                length = length * 256 + value
            }
        }
        if (length > 32768 || (opcode != 1 && length > 125)) throw ProtocolException("Client frame too large")
        repeat(4) { bytes.add(byte()) }
        header = bytes.map(Int::toByte).toByteArray(); position = 0; remaining = length.toInt()
        return true
    }
    override fun read(): Int {
        if (position == header.size && remaining == 0 && !next()) return -1
        if (position < header.size) return header[position++].toInt() and 255
        remaining--; return byte()
    }
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (length == 0) return 0
        if (position == header.size && remaining == 0 && !next()) return -1
        if (position < header.size) {
            val count = minOf(length, header.size - position)
            header.copyInto(buffer, offset, position, position + count); position += count; return count
        }
        val count = input.read(buffer, offset, minOf(length, remaining))
        if (count < 0) throw EOFException()
        remaining -= count; return count
    }
    override fun close() = input.close()
}
