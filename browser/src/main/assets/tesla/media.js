import {createBrowserAudio} from './browser-audio.js';

export function createMedia({video,getToken,onTransport=()=>{},onAudio=()=>{}}) {
  let socket = null, peer = null, generation = 0, id = -1, displayed = false, retry = null;
  let connecting = false, lastTime = -1, lastDecoded = -1, lastProgress = 0;
  const send = data => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(data)); return true;
  };
  const audio = createBrowserAudio({send,onState:onAudio});
  function stopRtc() {
    displayed=false; onTransport('jpeg');
    const old=peer; peer=null;
    if (old) { old.ontrack=null; old.onconnectionstatechange=null; old.close(); }
    video.pause(); video.srcObject=null; video.hidden=true;
  }
  function fallback() { send({type:'rtc-fallback',id}); stopRtc(); }
  async function offer(message) {
    stopRtc(); id=message.id;
    const ticket=generation, offerId=id;
    try {
      const rtc=new RTCPeerConnection({iceServers:[]}); peer=rtc;
      lastTime=-1; lastDecoded=-1; lastProgress=performance.now();
      const current=()=>peer===rtc && generation===ticket && id===offerId;
      rtc.ontrack=async event=>{
        if (!current()) return;
        video.srcObject=event.streams[0] || new MediaStream([event.track]);
        try { await video.play(); } catch (error) { console.warn('WebRTC playback: '+error.message); if (current()) fallback(); }
      };
      rtc.onconnectionstatechange=()=>{ if (current() && ['failed','closed','disconnected'].includes(rtc.connectionState)) fallback(); };
      // Prefer the Android peer as DTLS client. MbedTLS 3.6 cannot reassemble
      // fragmented initial ClientHello messages from newer Chromium clients.
      await rtc.setRemoteDescription({type:'offer',sdp:message.sdp.replace(/a=setup:actpass/g,'a=setup:active')});
      if (!current()) return;
      await rtc.setLocalDescription(await rtc.createAnswer());
      if (rtc.iceGatheringState!=='complete') await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>{rtc.removeEventListener('icegatheringstatechange',changed);reject(new Error('ICE timeout'));},4000);
        const changed=()=>{if(rtc.iceGatheringState==='complete'){clearTimeout(timeout);rtc.removeEventListener('icegatheringstatechange',changed);resolve();}};
        rtc.addEventListener('icegatheringstatechange',changed); changed();
      });
      if (current()) send({type:'rtc-answer',id:offerId,sdp:rtc.localDescription.sdp});
    } catch (error) { console.warn('WebRTC fallback: '+error.message); if (generation===ticket && id===offerId) fallback(); }
  }
  video.addEventListener('playing',()=>{
    if (!peer || !video.videoWidth) return;
    displayed=true; video.hidden=false; onTransport('webrtc'); send({type:'rtc-ready',id}); lastProgress=performance.now();
  });
  const timer=setInterval(async()=>{
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (document.hidden) { close(); return; }
    send({type:'ping'}); audio.heartbeat();
    const rtc=peer, currentId=id;
    if (!rtc) return;
    try {
      const stats=await rtc.getStats();
      if (rtc!==peer) return;
      let decoded=0;
      stats.forEach(report=>{if(report.type==='inbound-rtp' && (report.kind==='video' || report.mediaType==='video')) decoded=report.framesDecoded||0;});
      if (decoded>lastDecoded || video.currentTime>lastTime) {lastProgress=performance.now();lastDecoded=decoded;lastTime=video.currentTime;}
      send({type:'rtc-feedback',id:currentId,decoded});
      if (performance.now()-lastProgress > (displayed?3500:10000)) fallback();
    } catch (_) { fallback(); }
  },1000);
  function open() {
    if (connecting || socket || document.hidden || !getToken()) return;
    connecting=true; const ticket=++generation;
    const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/media`);
    socket=ws; ws.binaryType='arraybuffer';
    ws.onopen=()=>{connecting=false;send({type:'hello',token:getToken(),rtc:localStorage.getItem('diplay-video')!=='jpeg' && typeof RTCPeerConnection==='function'});};
    ws.onmessage=event=>{
      if (socket!==ws) return;
      if (event.data instanceof ArrayBuffer) { audio.receive(event.data); return; }
      let data; try {data=JSON.parse(event.data);} catch (_) {return;}
      if (data.type==='rtc-offer') offer(data);
      else if(data.type==='rtc-stop' && data.id===id) stopRtc();
      else if(data.type==='audio-stop') audio.stopped(data.stream);
    };
    ws.onclose=()=>{
      if(socket!==ws) return;
      socket=null;connecting=false;audio.disable();stopRtc();
      if(generation===ticket && !document.hidden) retry=setTimeout(open,3000);
    };
    ws.onerror=()=>ws.close();
  }
  function close() {
    generation++; clearTimeout(retry); connecting=false;
    const old=socket;socket=null; if(old){old.onclose=null;old.close();}
    audio.disable();stopRtc();
  }
  return {open,close,audio,
    useVideo(mode){localStorage.setItem('diplay-video',mode);close();open();},
    get displayed(){return displayed;},
    dispose(){close();clearInterval(timer);audio.close();}
  };
}
