/**
 * Real Worker/WebSocket/AudioWorklet check using synthetic PCM and the production player.
 * Uses the same DIPLAY_PLAYWRIGHT_MODULE / DIPLAY_CHROMIUM_PATH options as verify-ui.mjs.
 * Optional DIPLAY_AUDIO_OUTPUT writes the report. No vehicle-performance claim is made.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const assets=fileURLToPath(new URL('../src/main/assets/tesla/',import.meta.url));
const imported=process.env.DIPLAY_PLAYWRIGHT_MODULE;
const module=await import(imported?pathToFileURL(imported).href:'playwright');
const {chromium}=module.chromium?module:module.default;
const sockets=new Set(),connections=[];
const probe=`
class Probe extends AudioWorkletProcessor {
  constructor(){super();this.energy=[0,0];this.frames=0;}
  process(inputs,outputs){
    const size=outputs[0][0].length;
    for(let role=0;role<2;role++)for(let i=0;i<size;i++){
      const value=inputs[role][0]?.[i]||0;this.energy[role]+=value*value;
    }
    this.frames+=size;
    if(this.frames>=sampleRate/10){
      this.port.postMessage({frame:currentFrame,frames:this.frames,rate:sampleRate,
        music:Math.sqrt(this.energy[0]/this.frames),navigation:Math.sqrt(this.energy[1]/this.frames)});
      this.frames=0;this.energy=[0,0];
    }
    return true;
  }
}
registerProcessor('audio-test-probe',Probe);`;
const html=`<video id="video"></video><script type="module">
import {createMedia} from './media.js';
window.media=createMedia({video:document.getElementById('video'),getToken:()=> '0'.repeat(32)});
media.audio.setBuffer(400);media.open();
</script>`;
const server=createServer(async(req,res)=>{
  try {
    const name=new URL(req.url,'http://localhost').pathname.slice(1);
    if(!name){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);return;}
    if(name==='__offer') {
      let body='';for await(const chunk of req)body+=chunk;
      connections.at(-1).socket.write(frame(1,Buffer.from(body)));
      res.writeHead(200);res.end();return;
    }
    if(name==='__audio-probe.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(probe);return;}
    if(!/^[a-z-]+\.js$/.test(name)){res.writeHead(404);res.end();return;}
    const source=await readFile(resolve(assets,name));
    res.writeHead(200,{'Content-Type':'text/javascript'});res.end(source);
  } catch(error){res.writeHead(500);res.end(String(error));}
});
function frame(opcode,payload) {
  const header=Buffer.alloc(payload.length<126?2:4);header[0]=0x80|opcode;
  if(header.length===2)header[1]=payload.length;
  else {header[1]=126;header.writeUInt16BE(payload.length,2);}
  return Buffer.concat([header,payload]);
}
function pcm(role,sequence,offset) {
  const rate=role===1?44100:24000,channels=role===1?2:1,count=rate/50;
  const data=Buffer.alloc(20+count*channels*2);
  data.writeUInt32LE(0x31415057,0);data.writeInt32LE(role,4);data.writeUInt32LE(rate,8);
  data.writeUInt16LE(channels,12);data.writeUInt16LE(role,14);data.writeUInt32LE(sequence,16);
  for(let i=0;i<count;i++)for(let c=0;c<channels;c++)
    data.writeInt16LE(Math.round(8192*Math.sin(2*Math.PI*(role===1?1000:500)*(offset+i)/rate)),20+(i*channels+c)*2);
  return data;
}
server.on('upgrade',(req,socket,head)=>{
  assert.equal(req.url,'/api/media');
  const key=createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+key+'\r\n\r\n');
  sockets.add(socket);
  const state={socket,acks:0,pings:0,ready:false,readyFalse:0,sequence:0,next:performance.now()+20,offset:0};
  connections.push(state);
  let incoming=head;
  const receive=chunk=>{
    incoming=Buffer.concat([incoming,chunk]);
    while(incoming.length>=2) {
      const opcode=incoming[0]&15,masked=!!(incoming[1]&128);
      let length=incoming[1]&127,at=2;
      if(length===126){if(incoming.length<4)return;length=incoming.readUInt16BE(2);at=4;}
      assert.notEqual(length,127,'fixture control frames are bounded');
      assert.equal(masked,true);
      if(incoming.length<at+4+length)return;
      const mask=incoming.subarray(at,at+4),payload=Buffer.from(incoming.subarray(at+4,at+4+length));
      for(let i=0;i<length;i++)payload[i]^=mask[i%4];
      incoming=incoming.subarray(at+4+length);
      if(opcode===8){socket.end(frame(8,payload));return;}
      if(opcode===9){socket.write(frame(10,payload));continue;}
      assert.equal(opcode,1);
      const message=JSON.parse(payload.toString());
      if(message.type==='hello')socket.write(frame(1,Buffer.from(JSON.stringify({type:'welcome'}))));
      if(message.type==='audio-ack')state.acks++;
      if(message.type==='ping')state.pings++;
      if(message.type==='rtc-answer'){state.answer=message.sdp;state.onAnswer?.(message.sdp);}
      if(message.type==='audio-ready'){
        if(!message.playback)state.readyFalse++;
        if(!state.ready&&message.playback)state.next=performance.now()+20;
        state.ready=message.playback;
      }
    }
  };
  socket.on('data',receive);
  const timer=setInterval(()=>{
    const now=performance.now();
    if(!state.ready)return;
    while(state.next<=now) {
      socket.write(frame(2,pcm(1,++state.sequence,state.offset*882)));
      socket.write(frame(2,pcm(2,++state.sequence,state.offset*480)));
      state.offset++;state.next+=20;
    }
  },5);
  socket.on('close',()=>{clearInterval(timer);sockets.delete(socket);});
  socket.on('error',error=>{
    // terminate() closes a Worker's socket abruptly rather than sending a close frame.
    if(error.code!=='ECONNRESET')console.error(error);
    socket.destroy();
  });
});

let browser;
const report={scope:'Real Edge audio render output under synthetic PCM and deliberate main-thread stalls',checks:[]};
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,executablePath:process.env.DIPLAY_CHROMIUM_PATH||undefined,
    args:['--autoplay-policy=no-user-gesture-required','--no-sandbox']});
  report.browser=browser.version();
  const inspector=await browser.newBrowserCDPSession();
  async function cpu() {
    const {processInfo}=await inspector.send('SystemInfo.getProcessInfo');
    return new Map(processInfo.map(process=>[process.id,process.cpuTime]));
  }
  report.cpu={};
  async function pageFor(mode) {
    const context=await browser.newContext(),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    await page.addInitScript(({mode})=>{
      if(mode==='legacy')window.Worker=undefined;
      const NativeContext=window.AudioContext;
      window.AudioContext=class extends NativeContext {
        constructor(options) {
          super({...options,sampleRate:48000});window.__context=this;window.__gains=[];
          if(mode==='failed') {
            const load=this.audioWorklet.addModule.bind(this.audioWorklet);
            this.audioWorklet.addModule=url=>String(url).endsWith('/audio-worklet.js')?
              Promise.reject(new Error('Intentional fixture module failure')):load(url);
          }
        }
        createGain(){const gain=super.createGain();window.__gains.push(gain);return gain;}
      };
    },{mode});
    await page.goto(base);
    await page.waitForFunction(()=>window.media?.audio.enabled);
    await page.evaluate(async()=>{
      media.setAudioVolume('music',35);media.setAudioVolume('navigation',80);
      await __context.audioWorklet.addModule('/__audio-probe.js');
      const node=new AudioWorkletNode(__context,'audio-test-probe',{numberOfInputs:2,numberOfOutputs:1,outputChannelCount:[2]});
      window.__samples=[];node.port.onmessage=e=>__samples.push(e.data);
      __gains[0].connect(node,0,0);__gains[1].connect(node,0,1);node.connect(__context.destination);
      window.__probe=node;
    });
    await page.waitForFunction(()=>__samples.length>8 && __samples.at(-1).music>.03 && __samples.at(-1).navigation>.1);
    const sample=await page.evaluate(()=>__samples.at(-1));
    assert.ok(Math.abs(sample.music-.25*.35/Math.sqrt(2))<.004);
    assert.ok(Math.abs(sample.navigation-.25*.8/Math.sqrt(2))<.004);
    if(mode!=='failed') {
      await page.evaluate(async()=>{
        const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
        const drawing=canvas.getContext('2d');let frame=0;
        const paint=()=>{drawing.fillStyle='#123456';drawing.fillRect(0,0,960,540);
          drawing.fillStyle='#ffffff';drawing.fillRect((frame++*3)%900,200,40,40);};
        paint();window.__paint=setInterval(paint,1000/30);
        const stream=window.__source=canvas.captureStream(30),peer=window.__sender=new RTCPeerConnection({iceServers:[]});
        const transceiver=peer.addTransceiver(stream.getVideoTracks()[0],{direction:'sendonly',streams:[stream]});
        const codecs=RTCRtpSender.getCapabilities('video').codecs;
        const preferred=codecs.some(c=>c.mimeType.toLowerCase()==='video/h264')?'video/h264':'video/vp8';
        transceiver.setCodecPreferences(codecs.filter(c=>c.mimeType.toLowerCase()===preferred));
        window.__codec=preferred;
        await peer.setLocalDescription(await peer.createOffer());
        if(peer.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>reject(new Error('Fixture ICE gathering timed out')),4000);
          const changed=()=>{if(peer.iceGatheringState==='complete'){
            clearTimeout(timeout);peer.removeEventListener('icegatheringstatechange',changed);resolve();
          }};
          peer.addEventListener('icegatheringstatechange',changed);changed();
        });
        await fetch('/__offer',{method:'POST',body:JSON.stringify({type:'rtc-offer',id:1,
          sdp:peer.localDescription.sdp,recoveryGraceMs:10000})});
      });
      const state=connections.at(-1);
      const answer=await new Promise((resolve,reject)=>{
        if(state.answer){resolve(state.answer);return;}
        const timeout=setTimeout(()=>{state.onAnswer=null;reject(new Error('Fixture answer timed out'));},4000);
        state.onAnswer=sdp=>{clearTimeout(timeout);state.onAnswer=null;resolve(sdp);};
      });
      await page.evaluate(sdp=>__sender.setRemoteDescription({type:'answer',sdp}),answer);
      await page.waitForFunction(()=>media.displayed&&document.getElementById('video').videoWidth===960);
      await page.evaluate(()=>{
        window.__presented=0;
        const count=()=>{__presented++;document.getElementById('video').requestVideoFrameCallback(count);};
        document.getElementById('video').requestVideoFrameCallback(count);
      });
      await page.waitForTimeout(750);
    }
    return {page,context,errors,state:connections.at(-1)};
  }
  for(const mode of ['worklet','legacy','failed']) {
    const f=await pageFor(mode);
    try {
      const engine=await f.page.evaluate(()=>media.audio.stats());
      assert.equal(engine.engine,mode==='worklet'?'worklet':'compatibility');
      if(mode==='failed'){
        assert.equal(engine.playbackError,'worklet-unavailable');
        report.checks.push('Module failure: audible native-rate compatibility playback on the same Worker socket');
        continue;
      }
      const cpuBefore=await cpu(),framesBefore=await f.page.evaluate(()=>__presented),started=performance.now();
      await f.page.waitForTimeout(3000);
      const cpuAfter=await cpu();
      const wallMs=performance.now()-started,framesAfter=await f.page.evaluate(()=>__presented);
      report.cpu[mode]={wallMs,presentedFps:(framesAfter-framesBefore)*1000/wallMs,
        processCpuMs:[...cpuAfter].reduce((sum,[id,time])=>
        sum+Math.max(0,time-(cpuBefore.get(id)??time))*1000,0)};
      assert.ok(report.cpu[mode].presentedFps>=27,'native video must keep presenting at approximately 30 fps while audio plays');
      const before={acks:f.state.acks,pings:f.state.pings,readyFalse:f.state.readyFalse};
      const baseline=await f.page.evaluate(()=>({sample:__samples.at(-1).frame,stats:media.audio.stats()}));
      await f.page.evaluate(()=>{const end=performance.now()+2200;while(performance.now()<end){}});
      await f.page.waitForTimeout(150);
      const after=await f.page.evaluate(frame=>({stats:media.audio.stats(),samples:__samples.filter(s=>s.frame>frame)}),baseline.sample);
      assert.ok(after.samples.length>=18,'the real audio render clock must keep advancing during the stall');
      if(mode==='legacy') {
        assert.ok(after.samples.some(s=>s.music<.001),'the legacy player must reproduce actual music starvation');
        report.checks.push('Legacy comparison: a 2.2-second UI stall reproduces silent music render output');
        continue;
      }
      assert.ok(after.samples.every(s=>s.music>.03 && s.navigation>.1),'both rendered roles must remain audible throughout the UI stall');
      assert.equal(after.stats.underruns,baseline.stats.underruns);
      assert.equal(f.state.readyFalse,before.readyFalse);
      assert.ok(f.state.acks-before.acks>=180,'Worker ACKs must continue independently of the main thread');
      assert.ok(f.state.pings-before.pings>=2);
      report.stall={ms:2200,renderedWindows:after.samples.length,acks:f.state.acks-before.acks,
        minimumMusicRms:Math.min(...after.samples.map(s=>s.music)),underruns:after.stats.underruns};
      report.checks.push('Real Worker + resampling Worklet: no music/guidance silence, rebuffer, or readiness loss during a 2.2-second main-thread stall');
      await f.page.evaluate(()=>media.setAudioVolume('music',0));
      await f.page.waitForTimeout(250);
      const muted=await f.page.evaluate(()=>__samples.at(-1));
      assert.ok(muted.music<.001&&muted.navigation>.1);
      await f.page.evaluate(()=>media.setAudioVolume('music',35));
      const count=connections.length;
      await f.page.evaluate(()=>media.audio.disable());
      await f.page.waitForTimeout(200);assert.equal(f.state.ready,false);
      await f.page.evaluate(()=>media.audioPreference.start());
      await f.page.waitForTimeout(700);
      assert.equal(await f.page.evaluate(()=>media.audio.stats().engine),'worklet');
      assert.ok((await f.page.evaluate(()=>__samples.at(-1))).music>.03);
      await f.page.evaluate(()=>__context.suspend());
      await f.page.waitForTimeout(200);assert.equal(f.state.ready,false);
      assert.equal(await f.page.evaluate(()=>media.audio.enabled),false);
      await f.page.evaluate(()=>media.audioPreference.start());
      await f.page.waitForTimeout(700);assert.equal(f.state.ready,true);
      assert.equal(connections.length,count);
      report.checks.push('Independent music/navigation gains, manual off/on, context suspension/recovery: one socket, no reconnect');
    } finally {
      await f.page.evaluate(()=>{
        media.close();clearInterval(window.__paint);window.__sender?.close();
        window.__source?.getTracks().forEach(track=>track.stop());
      });
      assert.deepEqual(f.errors,[]);
      await f.context.close();
    }
  }
  assert.ok(report.cpu.worklet.presentedFps>=report.cpu.legacy.presentedFps*.9);
  report.checks.push('Real native WebRTC video and audio together: approximately 30 presented fps in both pipelines');
  if(process.env.DIPLAY_AUDIO_OUTPUT) {
    const output=resolve(process.env.DIPLAY_AUDIO_OUTPUT);
    await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  }
  console.log(JSON.stringify(report,null,2));
} finally {
  await browser?.close();
  for(const socket of sockets)socket.destroy();
  await new Promise(resolve=>server.close(resolve));
}
