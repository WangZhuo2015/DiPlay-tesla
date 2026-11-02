export function decodeAudioPacket(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 22 || buffer.byteLength > 65536) return null;
  const header = new DataView(buffer), channels = header.getUint16(12,true), rate = header.getUint32(8,true);
  if (header.getUint32(0,true) !== 0x31415057 || channels < 1 || channels > 2 || rate < 8000 || rate > 96000 || (buffer.byteLength-20) % (channels*2)) return null;
  return {stream:header.getInt32(4,true),role:header.getUint16(14,true),rate,channels,
    sequence:header.getUint32(16,true),pcm:new Int16Array(buffer,20)};
}
