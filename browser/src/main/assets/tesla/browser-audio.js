// PCM packet layout and independent playback route inspired by tepla 0.2.1 (GPL-3.0).
// AudioBuffer carries the original sample rate; WebAudio performs hardware-rate conversion.
export function decodeAudioPacket(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 22 || buffer.byteLength > 65536) return null;
  const header = new DataView(buffer), channels = header.getUint16(12,true), rate = header.getUint32(8,true);
  if (header.getUint32(0,true) !== 0x31415057 || channels < 1 || channels > 2 || rate < 8000 || rate > 96000 || (buffer.byteLength-20) % (channels*2)) return null;
  // The reserved u16 is a role, not the dynamically assigned stream ID.
  // Zero/unknown roles from older or newer servers retain unity gain.
  return {stream:header.getInt32(4,true),role:header.getUint16(14,true),rate,channels,sequence:header.getUint32(16,true),pcm:new Int16Array(buffer,20)};
}

export function normalizeAudioVolume(value) {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return 100;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.max(0,Math.min(100,number))) : 100;
}

// A playback preference survives temporary route loss; only the driver's toggle saves it.
export function createAudioPreference({audio,storedValue=null,save=()=>{}}) {
  let wanted=storedValue!=='false';
  return {
    get wanted(){return wanted;},
    start(){
      if(!wanted)return Promise.resolve(false);
      if(audio.enabled){audio.heartbeat();return Promise.resolve(true);}
      // Do not suppress a user gesture behind a resume() awaiting autoplay permission.
      return audio.enable();
    },
    toggle(){
      wanted=!audio.enabled;save(String(wanted));
      if(!wanted){audio.disable();return Promise.resolve(false);}
      return audio.enable();
    }
  };
}

export function createBrowserAudio({send,onState=()=>{},volumes:initialVolumes={},createContext=()=>new (window.AudioContext||window.webkitAudioContext)({latencyHint:'playback'})}) {
  let context = null, enabled = false, generation = 0, bufferMs = 200;
  const streams = new Map(), nodes = new Set();
  const volumes = {music:normalizeAudioVolume(initialVolumes.music),navigation:normalizeAudioVolume(initialVolumes.navigation)};
  const gains = new Map();
  function setVolume(role,value) {
    if (!Object.hasOwn(volumes,role)) return null;
    volumes[role] = normalizeAudioVolume(value);
    const parameter = gains.get(role)?.gain;
    if (parameter) {
      const now = context.currentTime;
      // Hold an in-progress ramp when possible, avoiding clicks on repeated input.
      if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
      else { parameter.cancelScheduledValues(now); parameter.setValueAtTime(parameter.value,now); }
      parameter.linearRampToValueAtTime(volumes[role]/100,now+.03);
    }
    return volumes[role];
  }
  let underruns = 0, publishedState = null;
  function stop(stream = null) {
    for (const node of [...nodes]) if (stream === null || node.stream === stream) {
      try { node.stop(); node.disconnect(); } catch (_) {}
      nodes.delete(node);
    }
    if (stream === null) streams.clear(); else streams.delete(stream);
  }
  function notifyState() {
    // PCM packets arrive much more often than the controls change. Keep transport
    // acknowledgements at packet cadence without rewriting the audio UI each time.
    if (publishedState && publishedState.enabled === enabled && publishedState.bufferMs === bufferMs && publishedState.underruns === underruns) return;
    publishedState = {enabled,bufferMs,underruns};
    onState({...publishedState});
  }
  function publish() { send({type:'audio-ready',playback:enabled && context && context.state === 'running'}); notifyState(); }
  function disable() { generation++; enabled = false; stop(); publish(); }
  async function enable() {
    const ticket = ++generation;
    try {
      if (!context || context.state === 'closed') {
        for (const gain of gains.values()) gain.disconnect();
        gains.clear();
        context = createContext();
        for (const role of ['music','navigation']) {
          const gain = context.createGain();
          gain.gain.value = volumes[role]/100;
          gain.connect(context.destination); gains.set(role,gain);
        }
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
    const role = frame.role === 1 ? 'music' : frame.role === 2 ? 'navigation' : null;
    node.connect(gains.get(role) || context.destination); nodes.add(node);
    node.onended = () => { nodes.delete(node); node.disconnect(); };
    node.start(stream.next); stream.next += duration; streams.set(frame.stream,stream);
    notifyState(); return true;
  }
  return {enable,disable,receive,
    setVolume,
    get volumes() { return {...volumes}; },
    heartbeat:publish,
    stopped:stop,
    setBuffer(ms) { if (![80,200,400].includes(ms)) return; bufferMs=ms; stop(); publish(); },
    close() {
      disable();
      for (const gain of gains.values()) gain.disconnect();
      gains.clear();
      if (context) { context.onstatechange=null; context.close().catch(()=>{}); context=null; }
    },
    get enabled() { return enabled; },
    stats() {
      const now=context?.currentTime||0;
      return {enabled,targetMs:bufferMs,queuedMs:enabled?Math.max(0,...[...streams.values()].map(stream=>(stream.next-now)*1000)):0,underruns};
    }
  };
}
