import {decodeAudioPacket} from './audio-packet.js';
import {resamplingKernel} from './audio-worklet.js';

export function createWorkerTransport({post,createSocket,clock=()=>performance.now(),
  every=(fn,ms)=>setInterval(fn,ms),cancel=id=>clearInterval(id)}) {
  let socket=null, port=null, audioEpoch=0, playback=false, renderedAt=null, attachedAt=null;
  let packets=0, lastPacket=null, maxArrivalGapMs=0;
  let outputRate=48000;
  const formats=new Map(), kernels=new Map();
  const gaps={music:{last:null,max:0},navigation:{last:null,max:0}};
  const ready=value=>{
    if (socket?.readyState===1) socket.send(JSON.stringify({type:'audio-ready',playback:value}));
  };
  function detach() {
    if (port) { port.postMessage({type:'close'}); port.close(); }
    port=null; playback=false; renderedAt=null; ready(false);
  }
  const timer=every(()=>{
    if (socket?.readyState!==1) return;
    socket.send(JSON.stringify({type:'ping'}));
    if(port && playback && clock()-(renderedAt??attachedAt)>=1800) {
      post({type:'audio-error',epoch:audioEpoch,reason:'render-stalled'});detach();
    } else if(port)ready(playback);
  },1000);
  function command(data) {
    if (data.type==='open') {
      if (socket) throw new Error('Media socket already open');
      const ws=createSocket(data.url); socket=ws; ws.binaryType='arraybuffer';
      ws.onopen=()=>{ if(socket===ws)post({type:'open'}); };
      ws.onmessage=event=>{
        if(socket!==ws)return;
        if(event.data instanceof ArrayBuffer && port) {
          const frame=decodeAudioPacket(event.data);
          if (!frame) { post({type:'audio-error',epoch:audioEpoch,reason:'invalid-packet'}); detach(); return; }
          ws.send(JSON.stringify({type:'audio-ack',sequence:frame.sequence}));
          const at=clock();
          if(lastPacket!==null)maxArrivalGapMs=Math.max(maxArrivalGapMs,at-lastPacket);
          lastPacket=at; packets++;
          const role=frame.role===1?'music':frame.role===2?'navigation':null;
          if(role) {
            const gap=gaps[role];
            if(gap.last!==null)gap.max=Math.max(gap.max,at-gap.last);
            gap.last=at;
          }
          let kernel=null;
          const format=frame.rate+':'+frame.channels+':'+frame.role;
          if(formats.get(frame.stream)!==format) {
            if(!kernels.has(frame.rate)) {
              if(kernels.size>=8)kernels.delete(kernels.keys().next().value);
              kernels.set(frame.rate,resamplingKernel(frame.rate,outputRate));
            }
            kernel=kernels.get(frame.rate)?.slice()||null;
            if(formats.size>=8 && !formats.has(frame.stream))formats.delete(formats.keys().next().value);
            formats.set(frame.stream,format);
          }
          port.postMessage({type:'pcm',buffer:event.data,kernel},
            kernel?[event.data,kernel.buffer]:[event.data]);
          return;
        }
        if(typeof event.data==='string' && port) {
          let message;
          try { message=JSON.parse(event.data); } catch { post({type:'message',data:event.data}); return; }
          if(message.type==='audio-stop') {formats.delete(message.stream);port.postMessage({type:'stop',stream:message.stream});return;}
        }
        post({type:'message',data:event.data},event.data instanceof ArrayBuffer?[event.data]:[]);
      };
      ws.onclose=()=>{if(socket===ws){socket=null;detach();post({type:'close'});}};
      ws.onerror=()=>{if(socket===ws)post({type:'error',reason:'socket-error'});};
    } else if(data.type==='send') {
      if(socket?.readyState!==1)return;
      const message=JSON.parse(data.data);
      if(message.type==='ping')return; // The worker owns the heartbeat even during a blocked UI.
      if(port && message.type==='audio-ready') {
        playback=message.playback===true;
        ready(playback && clock()-(renderedAt??attachedAt)<1800);return;
      }
      socket.send(data.data);
    } else if(data.type==='audio-port') {
      detach(); port=data.port; audioEpoch=data.epoch; playback=data.playback;
      attachedAt=clock();
      outputRate=data.sampleRate;formats.clear();kernels.clear();
      packets=0; lastPacket=null; maxArrivalGapMs=0;
      for(const gap of Object.values(gaps)){gap.last=null;gap.max=0;}
      const current=port, epoch=audioEpoch;
      port.onmessage=event=>{
        if(port!==current)return;
        const message=event.data;
        if(message.type==='stats') {
          renderedAt=clock();
          const {type,...stats}=message;
          post({type:'audio-stats',epoch,stats:{...stats,packets,maxArrivalGapMs,
            musicMaxGapMs:gaps.music.max,navigationMaxGapMs:gaps.navigation.max}});
        } else if(message.type==='error') {
          post({type:'audio-error',epoch,reason:message.reason});detach();
        }
      };
      port.start();port.postMessage({type:'buffer',ms:data.bufferMs});ready(playback);
    } else if(data.type==='audio-buffer') {formats.clear();port?.postMessage({type:'buffer',ms:data.ms});}
    else if(data.type==='audio-stop') {formats.delete(data.stream);port?.postMessage({type:'stop',stream:data.stream});}
    else if(data.type==='audio-detach') detach();
    else if(data.type==='close') { detach();socket?.close(); }
  }
  return {command,dispose(){cancel(timer);detach();socket?.close();socket=null;}};
}

if (typeof WorkerGlobalScope!=='undefined' && self instanceof WorkerGlobalScope) {
  const transport=createWorkerTransport({post:(message,transfer=[])=>self.postMessage(message,transfer),
    createSocket:url=>new WebSocket(url)});
  self.postMessage({type:'worker-ready'});
  self.onmessage=event=>{
    try { transport.command(event.data); }
    catch { self.postMessage({type:'error',reason:'worker-command-failed'});transport.dispose(); }
  };
}
