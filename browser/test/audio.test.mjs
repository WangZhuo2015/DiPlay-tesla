import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserAudio,decodeAudioPacket} from '../src/main/assets/tesla/browser-audio.js';

function packet(stream,rate=48000,channels=2,frames=960) {
  const bytes=new ArrayBuffer(20+frames*channels*2),header=new DataView(bytes);
  header.setUint32(0,0x31415057,true);header.setInt32(4,stream,true);header.setUint32(8,rate,true);header.setUint16(12,channels,true);
  new Int16Array(bytes,20).fill(16384);return bytes;
}
function fixture() {
  const started=[],messages=[];
  const context={state:'running',currentTime:0,resume:async()=>{},close:async()=>{},destination:{},
    createBuffer(channels,count,rate){const data=Array.from({length:channels},()=>new Float32Array(count));return{rate,getChannelData:i=>data[i]};},
    createBufferSource(){return{connect(){},disconnect(){},stop(){this.stopped=true;},start(time){this.time=time;started.push(this);}};}};
  const audio=createBrowserAudio({createContext:()=>context,send:data=>messages.push(data)});
  return{audio,context,started,messages};
}
test('continuous PCM keeps original sample rate and bridges a 120ms scheduling pause',async()=>{
  const{audio,context,started}=fixture();await audio.enable();
  for(let i=0;i<20;i++){context.currentTime=i*.02;audio.receive(packet(1,44100,2,882));}
  context.currentTime=.50;audio.receive(packet(1,44100,2,882));
  assert.equal(started[0].time,.2);assert.ok(Math.abs(started[20].time-.6)<1e-9);
  assert.equal(started[0].buffer.rate,44100);assert.equal(started[0].buffer.getChannelData(0)[0],.5);
  assert.ok(started.every(node=>!node.stopped));audio.close();
});
test('navigation starvation leaves music intact and context suspension releases playback',async()=>{
  const{audio,context,started,messages}=fixture();await audio.enable();
  audio.receive(packet(1));audio.receive(packet(2,24000,1,480));
  context.currentTime=.3;audio.receive(packet(2,24000,1,480));
  assert.ok(!started[0].stopped);assert.ok(started[1].stopped);
  context.state='suspended';context.onstatechange();
  assert.equal(audio.enabled,false);assert.equal(messages.at(-1).playback,false);assert.ok(started.every(node=>node.stopped));audio.close();
});
test('backlog releases the route and malformed or unaligned PCM is rejected',async()=>{
  const{audio,messages}=fixture();await audio.enable();
  for(let i=0;i<40;i++)audio.receive(packet(1));
  assert.equal(audio.enabled,false);assert.ok(messages.some(item=>item.type==='audio-ready' && !item.playback));
  assert.equal(decodeAudioPacket(new ArrayBuffer(21)),null);
  const bytes=packet(1);new DataView(bytes).setUint16(12,3,true);assert.equal(decodeAudioPacket(bytes),null);audio.close();
});
test('turning playback off while resume is pending cannot regain the route',async()=>{
  const{audio,context}=fixture();let resume;context.resume=()=>new Promise(resolve=>resume=resolve);
  const enabled=audio.enable();audio.disable();resume();assert.equal(await enabled,false);assert.equal(audio.enabled,false);audio.close();
});
