// PCM packet layout and independent playback route inspired by tepla 0.2.1 (GPL-3.0).
// AudioBuffer carries the original sample rate; WebAudio performs hardware-rate conversion.
export function decodeAudioPacket(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 22 || buffer.byteLength > 65536) return null;
  const header = new DataView(buffer), channels = header.getUint16(12,true), rate = header.getUint32(8,true);
  if (header.getUint32(0,true) !== 0x31415057 || channels < 1 || channels > 2 || rate < 8000 || rate > 96000 || (buffer.byteLength-20) % (channels*2)) return null;
  return {stream:header.getInt32(4,true),rate,channels,sequence:header.getUint32(16,true),pcm:new Int16Array(buffer,20)};
}

export function createBrowserAudio({send,onState=()=>{},createContext=()=>new (window.AudioContext||window.webkitAudioContext)({latencyHint:'playback'})}) {
  let context = null, enabled = false, generation = 0, bufferMs = 200;
  const streams = new Map(), nodes = new Set();
  let underruns = 0;
  function stop(stream = null) {
    for (const node of [...nodes]) if (stream === null || node.stream === stream) {
      try { node.stop(); node.disconnect(); } catch (_) {}
      nodes.delete(node);
    }
    if (stream === null) streams.clear(); else streams.delete(stream);
  }
  function publish() { send({type:'audio-ready',playback:enabled && context && context.state === 'running'}); onState({enabled,bufferMs,underruns}); }
  function disable() { generation++; enabled = false; stop(); publish(); }
  async function enable() {
    const ticket = ++generation;
    try {
      if (!context || context.state === 'closed') {
        context = createContext();
        context.onstatechange = () => { if (enabled && context.state !== 'running') disable(); };
      }
      await context.resume();
      if (ticket !== generation) return false;
      if (context.state !== 'running') throw new Error('Audio context paused');
      enabled = true; publish(); return true;
    } catch (_) { if (ticket === generation) disable(); return false; }
  }
  function receive(buffer) {
    const frame = decodeAudioPacket(buffer);
    if (!frame) return false;
    send({type:'audio-ack',sequence:frame.sequence});
    if (enabled && (!context || context.state !== 'running')) disable();
    if (!enabled) return true;
    const count = frame.pcm.length / frame.channels, duration = count / frame.rate;
    if (duration > .5) { disable(); return true; }
    const now = context.currentTime, target = bufferMs/1000;
    let stream = streams.get(frame.stream);
    if (!stream || stream.rate !== frame.rate || stream.channels !== frame.channels) {
      stop(frame.stream); stream = {next:now+target,rate:frame.rate,channels:frame.channels};
    }
    if (stream.next < now + .01) {
      // Rebuffer only the starved stream. Navigation never cancels already queued music.
      stop(frame.stream); underruns++; stream.next = now + target;
    }
    // A long decoder/network backlog should release the route instead of repeatedly cutting audio.
    if (stream.next-now > Math.max(.75,target+.4) || nodes.size >= 128) { disable(); return true; }
    const audio = context.createBuffer(frame.channels,count,frame.rate);
    for (let channel=0;channel<frame.channels;channel++) {
      const output = audio.getChannelData(channel);
      for (let i=0;i<count;i++) output[i] = frame.pcm[i*frame.channels+channel]/32768;
    }
    const node = context.createBufferSource(); node.buffer = audio; node.stream = frame.stream;
    node.connect(context.destination); nodes.add(node);
    node.onended = () => { nodes.delete(node); node.disconnect(); };
    node.start(stream.next); stream.next += duration; streams.set(frame.stream,stream);
    onState({enabled,bufferMs,underruns}); return true;
  }
  return {enable,disable,receive,
    heartbeat:publish,
    stopped:stop,
    setBuffer(ms) { if (![80,200,400].includes(ms)) return; bufferMs=ms; stop(); publish(); },
    close() { disable(); if (context) { context.onstatechange=null; context.close().catch(()=>{}); context=null; } },
    get enabled() { return enabled; }
  };
}
