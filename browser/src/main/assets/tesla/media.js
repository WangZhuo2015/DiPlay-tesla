import {createBrowserAudio,createAudioPreference} from './browser-audio.js';
import {createRtcHealth} from './rtc-health.js';

// NotAllowedError is a current playback/activation restriction, not permanent codec absence.
const retryableRtcError = error => error?.name !== 'NotSupportedError';

async function decodeJpeg(blob) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve,reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

// An in-flight fallback request can outlive page visibility or WebRTC takeover.
// Check ownership before each expensive stage and always release decoded bitmaps.
export async function presentJpegFrame({response,canvas,drawing,isCurrent,decode = decodeJpeg}) {
  if (!isCurrent()) {
    try { await response.body?.cancel(); } catch (_) { /* The response may already be closed. */ }
    return false;
  }
  const blob = await response.blob();
  if (!isCurrent()) return false;
  const picture = await decode(blob);
  try {
    if (!isCurrent()) return false;
    // Reassigning dimensions clears and reallocates the Canvas backing store.
    if (canvas.width !== picture.width) canvas.width = picture.width;
    if (canvas.height !== picture.height) canvas.height = picture.height;
    drawing.drawImage(picture,0,0);
    return true;
  } finally { picture.close?.(); }
}

// Recovery waiting follows WheelPlay's 4/10/30-second policy; media queues stay bounded separately.
export function createMedia({video,getToken,onTransport=()=>{},onAudio=()=>{},onStats=()=>{}}) {
  const recoveryKey = 'diplay-rtc-recovery-ms';
  const read = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const save = (key,value) => { try { localStorage.setItem(key,String(value)); } catch (_) {} };
  const recoveryValue = value => [4000,10000,30000].includes(Number(value)) ? Number(value) : 10000;
  let selectedGrace = recoveryValue(read(recoveryKey));
  let selectedMode = read('diplay-video') === 'jpeg' ? 'jpeg' : 'auto';
  let socket = null, session = null, generation = 0, lastOfferId = -1, displayed = false;
  let connecting = false, disposed = false, retry = null, stats = {};
  const now = () => performance.now();
  const socketCurrent = (ws,ticket) => !disposed && socket === ws && generation === ticket;
  const current = state => state !== null && session === state && socketCurrent(state.socket,state.generation);
  function publishStats(patch) { stats = {...stats,...patch}; onStats({...stats}); }
  function send(data) {
    const ws = socket;
    if (disposed || !ws || ws.readyState !== WebSocket.OPEN) return false;
    try { ws.send(JSON.stringify(data)); return true; }
    catch (_) { if (socket === ws) ws.close(); return false; }
  }
  const audio = createBrowserAudio({send,onState:onAudio});
  const audioPreference = createAudioPreference({audio,storedValue:read('diplay-browser-audio'),
    save:value=>save('diplay-browser-audio',value)});

  function removePlaying(state) {
    if (state?.playing) video.removeEventListener('playing',state.playing);
    if (state) state.playing = null;
  }
  function stopRtc(reason = null,connectionEnded = false) {
    const old = session;
    const wasDisplayed = displayed;
    session = null; displayed = false;
    removePlaying(old);
    if (old) {
      old.cancelGathering?.(); old.cancelGathering = null;
      old.rtc.ontrack = null; old.rtc.onconnectionstatechange = null;
      try { old.rtc.close(); } catch (_) {}
    }
    video.pause(); video.srcObject = null; video.hidden = true;
    // A JPEG-to-JPEG automatic retry must not cancel a drag/long press in app.js.
    // Closing the owning control connection still releases input even if it was JPEG.
    if (wasDisplayed || connectionEnded) onTransport('jpeg');
    if (!reason) stats = {};
    publishStats({decodedFps:null,dropped:null,recoveryGraceMs:old?.health.graceMs ?? selectedGrace,
      recovering:false,fallbackReason:reason});
  }
  function fallback(state,reason,retryable = true) {
    if (!current(state)) return;
    send({type:'rtc-fallback',id:state.id,...(retryable ? {} : {retryable:false})});
    stopRtc(reason);
  }
  function checkHealth(state,at) {
    if (!current(state)) return false;
    const reason = state.health.failureReason(at,state.displayed);
    if (reason) { fallback(state,reason); return false; }
    return true;
  }
  function publishRecovery(state,at,patch = {}) {
    if (current(state)) publishStats({...patch,
      recovering:state.serverRecovering || state.health.recovering(at)});
  }

  function waitForGathering(state) {
    const rtc = state.rtc;
    if (rtc.iceGatheringState === 'complete') return Promise.resolve(true);
    return new Promise((resolve,reject) => {
      let complete = false;
      const finish = (error = null,cancelled = false) => {
        if (complete) return;
        complete = true; clearTimeout(timeout);
        rtc.removeEventListener('icegatheringstatechange',changed);
        state.cancelGathering = null;
        if (error) reject(error); else resolve(!cancelled);
      };
      const changed = () => { if (rtc.iceGatheringState === 'complete') finish(); };
      const timeout = setTimeout(() => finish(new Error('ICE gathering timeout')),4000);
      state.cancelGathering = () => finish(null,true);
      rtc.addEventListener('icegatheringstatechange',changed);
      changed();
    });
  }
  async function offer(message,ws,ticket) {
    if (!socketCurrent(ws,ticket)) return;
    stopRtc(); lastOfferId = message.id;
    let state = null;
    try {
      const rtc = new RTCPeerConnection({iceServers:[]});
      state = {rtc,socket:ws,generation:ticket,id:message.id,
        health:createRtcHealth(now(),message.recoveryGraceMs),displayed:false,stream:null,
        trackGeneration:0,playing:null,cancelGathering:null,statsRequest:null,
        sampledAt:null,sampledFrames:null,serverRecovering:false};
      session = state;
      publishStats({recoveryGraceMs:state.health.graceMs});
      rtc.ontrack = async event => {
        if (!current(state)) return;
        removePlaying(state);
        const stream = event.streams?.[0] || new MediaStream([event.track]);
        const trackGeneration = ++state.trackGeneration;
        state.stream = stream;
        const currentTrack = () => current(state) && state.trackGeneration === trackGeneration &&
          state.stream === stream && video.srcObject === stream;
        let playResolved = false, trackReady = false;
        const playing = () => {
          if (!playResolved || !currentTrack() || video.paused || video.readyState < 2 || !video.videoWidth) return;
          if (trackReady) return;
          trackReady = true;
          state.displayed = displayed = true;
          video.hidden = false; onTransport('webrtc'); send({type:'rtc-ready',id:state.id});
        };
        state.playing = playing;
        video.addEventListener('playing',playing);
        video.srcObject = stream;
        try {
          await video.play();
          if (!currentTrack()) return;
          playResolved = true; playing();
        } catch (error) { if (currentTrack()) fallback(state,'playback-failed',retryableRtcError(error)); }
      };
      rtc.onconnectionstatechange = () => {
        if (!current(state)) return;
        const at = now();
        if (['failed','closed'].includes(rtc.connectionState)) { fallback(state,'connection-failed'); return; }
        if (rtc.connectionState === 'disconnected') state.health.disconnected(at);
        else if (rtc.connectionState === 'connected') state.health.connected(at);
        if (checkHealth(state,at)) publishRecovery(state,at);
      };
      // Keep the proven Android DTLS-client workaround for newer Chromium ClientHello fragmentation.
      await rtc.setRemoteDescription({type:'offer',sdp:message.sdp.replace(/a=setup:actpass/g,'a=setup:active')});
      if (!current(state)) return;
      const answer = await rtc.createAnswer();
      if (!current(state)) return;
      if (/^m=video 0(?: |\r?$)/m.test(answer.sdp)) { fallback(state,'video-unsupported',false); return; }
      await rtc.setLocalDescription(answer);
      if (!current(state) || !await waitForGathering(state) || !current(state)) return;
      send({type:'rtc-answer',id:state.id,sdp:rtc.localDescription.sdp});
    } catch (error) {
      // An old same-id offer may reject after a replacement has already started.
      if (state) { if (current(state)) fallback(state,'negotiation-failed',retryableRtcError(error)); }
      else if (socketCurrent(ws,ticket) && lastOfferId === message.id && session === null) {
        send({type:'rtc-fallback',id:message.id,...(retryableRtcError(error) ? {} : {retryable:false})});
        stopRtc('transport-unavailable');
      }
    }
  }

  function pollStats(state,at) {
    if (state.statsRequest) {
      // One getStats call per peer. A never-settling Promise still has a recovery deadline.
      if (at - state.statsRequest.started >= 1000) {
        state.health.statsFailed(state.statsRequest.started);
        publishStats({decodedFps:null,dropped:null});
      }
      if (checkHealth(state,at)) publishRecovery(state,at);
      return;
    }
    const request = {started:at};
    state.statsRequest = request;
    const valid = () => current(state) && state.statsRequest === request;
    const failed = () => {
      if (!valid()) return;
      state.statsRequest = null;
      state.health.statsFailed(now());
      if (checkHealth(state,now())) publishRecovery(state,now(),{decodedFps:null,dropped:null});
    };
    let pending;
    try { pending = state.rtc.getStats(); } catch (_) { failed(); return; }
    Promise.resolve(pending).then(reports => {
      if (!valid()) return;
      let decoded = null, dropped = null;
      try {
        reports.forEach(report => {
          if (report.type !== 'inbound-rtp' || (report.kind !== 'video' && report.mediaType !== 'video')) return;
          if (Number.isSafeInteger(report.framesDecoded) && report.framesDecoded >= 0) decoded = report.framesDecoded;
          if (Number.isSafeInteger(report.framesDropped) && report.framesDropped >= 0) dropped = report.framesDropped;
        });
      } catch (_) { failed(); return; }
      // Unsupported receiver counters remain unknown; do not invent decoded or delivered frames.
      if (decoded === null) { failed(); return; }
      state.statsRequest = null; state.health.statsRecovered();
      const sampled = now(), elapsed = sampled - state.sampledAt;
      const decodedFps = state.sampledAt !== null && elapsed > 0 && decoded >= state.sampledFrames ?
        (decoded - state.sampledFrames) * 1000 / elapsed : null;
      state.sampledAt = sampled; state.sampledFrames = decoded;
      send({type:'rtc-feedback',id:state.id,decoded});
      const expired = state.health.sample(decoded,sampled,state.displayed);
      publishRecovery(state,sampled,{decodedFps,dropped});
      if (expired) checkHealth(state,sampled);
    },failed);
  }
  const timer = setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (document.hidden) { close(); return; }
    send({type:'ping'}); audio.heartbeat();
    const state = session, at = now();
    if (state && checkHealth(state,at)) pollStats(state,at);
  },1000);

  function clearSocketHandlers(ws) { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; }
  function scheduleRetry(ticket) {
    clearTimeout(retry);
    if (!disposed && generation === ticket && !document.hidden) retry = setTimeout(() => {
      retry = null;
      if (!disposed && generation === ticket) open();
    },3000);
  }
  function open() {
    if (disposed || connecting || socket || document.hidden || !getToken()) return;
    clearTimeout(retry); retry = null;
    connecting = true;
    const ticket = ++generation;
    let ws;
    try { ws = new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/media`); }
    catch (_) { connecting = false; scheduleRetry(ticket); return; }
    socket = ws; ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      if (!socketCurrent(ws,ticket)) return;
      connecting = false;
      const token = getToken();
      if (!token) { close(); return; }
      send({type:'hello',token,rtc:selectedMode !== 'jpeg' && typeof RTCPeerConnection === 'function',
        recoveryGraceMs:selectedGrace});
      audioPreference.start();
    };
    ws.onmessage = event => {
      if (!socketCurrent(ws,ticket)) return;
      if (event.data instanceof ArrayBuffer) { audio.receive(event.data); return; }
      let data;
      try { data = JSON.parse(event.data); } catch (_) { return; }
      if (!data || typeof data !== 'object') return;
      if (data.type === 'rtc-offer' && Number.isSafeInteger(data.id) && typeof data.sdp === 'string') offer(data,ws,ticket);
      else if (data.type === 'rtc-progress' && current(session) && data.id === session.id) {
        const state = session, at = now(), received = {};
        if (Number.isSafeInteger(data.sent) && data.sent >= 0) state.health.source(data.sent,at);
        for (const key of ['sent','received','sendFailures','queueBudgetMs','queueFrames','queueBytes',
          'expiredFrames','overflowFrames','keyframeSkips','invalidatedFrames']) {
          if (Number.isSafeInteger(data[key]) && data[key] >= 0) received[key] = data[key];
        }
        state.serverRecovering = data.recovering === true;
        publishRecovery(state,at,received);
      } else if (data.type === 'rtc-stop' && data.id === lastOfferId) {
        const reason = typeof data.reason === 'string' ? data.reason : null;
        // Preserve the client's concrete cause when Android acknowledges its fallback request.
        stopRtc(reason === 'browser-fallback' && session === null ? stats.fallbackReason || reason : reason);
        publishStats({rtcRetryAfterMs:Number.isSafeInteger(data.retryAfterMs) && data.retryAfterMs >= 0 ? data.retryAfterMs : null,
          rtcRetryBlocked:data.retryBlocked === true});
      } else if (data.type === 'audio-stop') audio.stopped(data.stream);
    };
    ws.onclose = () => {
      if (!socketCurrent(ws,ticket)) return;
      clearSocketHandlers(ws); socket = null; connecting = false;
      audio.disable(); stopRtc(null,true); scheduleRetry(ticket);
    };
    ws.onerror = () => { if (socketCurrent(ws,ticket)) ws.close(); };
  }
  function close() {
    generation++; clearTimeout(retry); retry = null; connecting = false;
    const old = socket; socket = null;
    if (old) { clearSocketHandlers(old); old.close(); }
    audio.disable(); stopRtc(null,true);
  }
  function configureVideo(mode,graceMs = selectedGrace) {
    if (disposed) return;
    const nextMode = mode === 'jpeg' ? 'jpeg' : 'auto', nextGrace = recoveryValue(graceMs);
    save('diplay-video',nextMode); save(recoveryKey,nextGrace);
    if (nextMode === selectedMode && nextGrace === selectedGrace) return;
    selectedMode = nextMode; selectedGrace = nextGrace;
    close(); open();
  }
  return {open,close,audio,audioPreference,configureVideo,
    get mode() { return selectedMode; },
    useVideo(mode) { configureVideo(mode,selectedGrace); },
    get recoveryGraceMs() { return selectedGrace; },
    get displayed() { return displayed; },
    dispose() {
      if (disposed) return;
      close(); disposed = true; clearInterval(timer); audio.close();
    },
  };
}
