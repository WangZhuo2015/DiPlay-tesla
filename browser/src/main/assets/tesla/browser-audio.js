// PCM packet layout and independent playback route inspired by tepla 0.2.1 (GPL-3.0).
import {decodeAudioPacket} from './audio-packet.js';
export {decodeAudioPacket} from './audio-packet.js';

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
      if(!wanted){audio.disable('manual-off');return Promise.resolve(false);}
      return audio.enable();
    }
  };
}

export function createBrowserAudio({send,onState=()=>{},onDiagnostic=()=>{},volumes:initialVolumes={},createContext=()=>new (window.AudioContext||window.webkitAudioContext)({latencyHint:'playback'})}) {
  let context = null, enabled = false, generation = 0, bufferMs = 200;
  let transport=null, worklet=null, moduleLoad=null, workletFailed=false, playbackError=null;
  let workletStats={};
  const retired={underruns:0,musicUnderruns:0,navigationUnderruns:0,overruns:0};
  const legacyUnderruns={music:0,navigation:0};
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
    const total=underruns+retired.underruns+(workletStats.underruns||0);
    if (publishedState && publishedState.enabled === enabled && publishedState.bufferMs === bufferMs && publishedState.underruns === total) return;
    publishedState = {enabled,bufferMs,underruns:total};
    onState({...publishedState});
  }
  function publish() { send({type:'audio-ready',playback:enabled && context && context.state === 'running'}); notifyState(); }
  function detachWorklet() {
    if(!worklet)return;
    for(const key of Object.keys(retired))retired[key]+=workletStats[key]||0;
    workletStats={};worklet.onprocessorerror=null;worklet.disconnect();worklet.port.close();worklet=null;
    transport?.unbindAudio();
  }
  function disable(reason='client-disable') {
    if(enabled || worklet)onDiagnostic('audio-disable',{reason,contextState:context?.state||'unavailable'});
    generation++; enabled = false; detachWorklet();stop(); publish();
  }
  function failWorklet(reason) {
    onDiagnostic('audio-compatibility',{reason});
    playbackError=reason;workletFailed=true;
    console.warn('DiPlay audio: compatibility playback after '+reason);
    detachWorklet();publish();
  }
  async function enable() {
    onDiagnostic('audio-enable-request',{contextState:context?.state||'unavailable'});
    const ticket = ++generation;
    try {
      if (!context || context.state === 'closed') {
        for (const gain of gains.values()) gain.disconnect();
        gains.clear();
        context = createContext();
        moduleLoad=null;workletFailed=false;
        for (const role of ['music','navigation']) {
          const gain = context.createGain();
          gain.gain.value = volumes[role]/100;
          gain.connect(context.destination); gains.set(role,gain);
        }
        context.onstatechange = () => {
          onDiagnostic('audio-context',{contextState:context.state});
          if (enabled && context.state !== 'running') disable('context-not-running');
        };
      }
      // resume() must execute in the original user gesture, before waiting for a module fetch.
      const resumed=context.resume();
      if(transport?.bindAudio && context.audioWorklet && typeof AudioWorkletNode==='function' && !workletFailed) {
        const loadedContext=context;
        moduleLoad ||= new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>reject(new Error('Audio worklet load timed out')),4000);
          Promise.resolve().then(()=>loadedContext.audioWorklet.addModule(new URL('./audio-worklet.js',import.meta.url)))
            .then(()=>{clearTimeout(timeout);resolve();},error=>{clearTimeout(timeout);reject(error);});
        });
        // Attach a handler immediately, even when resume() is waiting for autoplay permission.
        moduleLoad.catch(()=>{});
      }
      await resumed;
      if (ticket !== generation) return false;
      if (context.state !== 'running') throw new Error('Audio context paused');
      if(moduleLoad && !workletFailed && transport?.bindAudio && !worklet) {
        let node;
        try {
          await moduleLoad;
          if(ticket!==generation)return false;
          node=new AudioWorkletNode(context,'diplay-pcm',{numberOfInputs:0,numberOfOutputs:3,
            outputChannelCount:[2,2,2]});
          node.connect(gains.get('music'),0);node.connect(gains.get('navigation'),1);node.connect(context.destination,2);
          node.onprocessorerror=()=>{if(worklet===node)failWorklet('processor-failed');};
          transport.bindAudio(node.port,{bufferMs,playback:true,sampleRate:context.sampleRate});
          worklet=node;playbackError=null;stop();
        } catch {
          if(ticket!==generation)return false;
          if(node && worklet!==node) {node.disconnect();node.port.postMessage({type:'close'});node.port.close();}
          failWorklet('worklet-unavailable');
        }
      }
      enabled = true;onDiagnostic('audio-enabled',{contextState:context.state,engine:worklet?'worklet':'compatibility'});publish(); return true;
    } catch (error) {
      onDiagnostic('audio-enable-failed',{errorName:error?.name||'Error',contextState:context?.state||'unavailable'});
      if (ticket === generation) disable('enable-failed'); return false;
    }
  }
  function receive(buffer) {
    const frame = decodeAudioPacket(buffer);
    if (!frame) return false;
    send({type:'audio-ack',sequence:frame.sequence});
    if (enabled && (!context || context.state !== 'running')) disable('context-not-running');
    if (!enabled) return true;
    const count = frame.pcm.length / frame.channels, duration = count / frame.rate;
    if (duration > .5) { disable('packet-too-long'); return true; }
    const now = context.currentTime, target = bufferMs/1000;
    let stream = streams.get(frame.stream);
    if (!stream || stream.rate !== frame.rate || stream.channels !== frame.channels) {
      stop(frame.stream); stream = {next:now+target,rate:frame.rate,channels:frame.channels};
    }
    if (stream.next < now + .01) {
      // Rebuffer only the starved stream. Navigation never cancels already queued music.
      stop(frame.stream); underruns++; stream.next = now + target;
      if(frame.role===1)legacyUnderruns.music++;
      if(frame.role===2)legacyUnderruns.navigation++;
    }
    // A long decoder/network backlog should release the route instead of repeatedly cutting audio.
    if (stream.next-now > Math.max(.75,target+.4) || nodes.size >= 128) { disable('audio-backlog'); return true; }
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
    setTransport(next) {
      if(next===transport)return;
      generation++;
      detachWorklet();
      if(transport){transport.onaudiostats=null;transport.onaudioerror=null;}
      transport=next;
      if(next) {
        next.onaudiostats=value=>{
          if(transport!==next || !worklet)return;
          workletStats=value;notifyState();
        };
        next.onaudioerror=reason=>{if(transport===next && worklet)failWorklet(reason);};
      }
    },
    setVolume,
    get volumes() { return {...volumes}; },
    heartbeat:publish,
    stopped(stream) {
      onDiagnostic('audio-stream-stop',{reason:'server-stream-stop'});
      if(worklet)transport.stopAudio(stream);else stop(stream);
    },
    setBuffer(ms) { if (![80,200,400].includes(ms)) return; bufferMs=ms; stop(); if(worklet)transport.audioBuffer(ms);publish(); },
    close() {
      disable();
      for (const gain of gains.values()) gain.disconnect();
      gains.clear();
      if (context) { context.onstatechange=null; context.close().catch(()=>{}); context=null; }
    },
    get enabled() { return enabled; },
    stats() {
      const now=context?.currentTime||0;
      return {enabled,targetMs:bufferMs,queuedMs:enabled?(worklet?workletStats.queuedMs||0:Math.max(0,...[...streams.values()].map(stream=>(stream.next-now)*1000))):0,
        ...workletStats,underruns:underruns+retired.underruns+(workletStats.underruns||0),
        musicUnderruns:legacyUnderruns.music+retired.musicUnderruns+(workletStats.musicUnderruns||0),
        navigationUnderruns:legacyUnderruns.navigation+retired.navigationUnderruns+(workletStats.navigationUnderruns||0),
        overruns:retired.overruns+(workletStats.overruns||0),
        engine:worklet?'worklet':'compatibility',contextState:context?.state||'unavailable',playbackError};
    }
  };
}
