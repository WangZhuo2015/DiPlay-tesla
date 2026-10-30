import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserAudio,createAudioPreference,decodeAudioPacket} from '../src/main/assets/tesla/browser-audio.js';

function packet(stream,rate=48000,channels=2,frames=960) {
  const bytes=new ArrayBuffer(20+frames*channels*2),header=new DataView(bytes);
  header.setUint32(0,0x31415057,true);header.setInt32(4,stream,true);header.setUint32(8,rate,true);header.setUint16(12,channels,true);
  new Int16Array(bytes,20).fill(16384);return bytes;
}
function fixture() {
  const started=[],messages=[],states=[];
  const context={state:'running',currentTime:0,resume:async()=>{},close:async()=>{},destination:{},
    createBuffer(channels,count,rate){const data=Array.from({length:channels},()=>new Float32Array(count));return{rate,getChannelData:i=>data[i]};},
    createBufferSource(){return{connect(){},disconnect(){},stop(){this.stopped=true;},start(time){this.time=time;started.push(this);}};}};
  const audio=createBrowserAudio({createContext:()=>context,send:data=>messages.push(data),onState:state=>states.push(state)});
  return{audio,context,started,messages,states};
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

test('browser audio defaults on and a saved manual off survives route loss and reload',async()=>{
  const{audio}=fixture();let saved;
  const preference=createAudioPreference({audio,save:value=>{saved=value;}});
  assert.equal(preference.wanted,true);assert.equal(await preference.start(),true);
  await preference.toggle();assert.equal(saved,'false');assert.equal(audio.enabled,false);
  assert.equal(await preference.start(),false);
  const reloaded=createAudioPreference({audio,storedValue:saved});
  assert.equal(await reloaded.start(),false);assert.equal(audio.enabled,false);
  await reloaded.toggle();assert.equal(audio.enabled,true);
  audio.disable();assert.equal(reloaded.wanted,true);assert.equal(audio.enabled,false);
  assert.equal(await reloaded.start(),true);audio.close();
});

test('a gesture can unlock default audio while the first autoplay resume is pending',async()=>{
  const{audio,context,messages}=fixture();let unlock,calls=0;
  context.state='suspended';
  context.resume=()=>{
    if(++calls===1)return new Promise(resolve=>{unlock=resolve;});
    context.state='running';unlock();return Promise.resolve();
  };
  const preference=createAudioPreference({audio});
  const autoplay=preference.start();
  assert.equal(audio.enabled,false);assert.ok(!messages.some(item=>item.playback));
  assert.equal(await preference.start(),true);assert.equal(await autoplay,false);
  assert.equal(audio.enabled,true);assert.equal(messages.at(-1).playback,true);audio.close();
});

test('continuous audio acknowledges every packet without publishing unchanged controls',async()=>{
  const{audio,context,started,messages,states}=fixture();await audio.enable();
  for(let i=0;i<50;i++) {
    context.currentTime=i*.02;
    audio.receive(packet(1));
    // Simulate played nodes ending so the fixture retains only scheduled audio.
    if(i>=12)started[i-12].onended();
  }
  audio.heartbeat();audio.heartbeat();
  assert.equal(started.length,50);
  assert.equal(messages.filter(message=>message.type==='audio-ack').length,50);
  assert.equal(messages.filter(message=>message.type==='audio-ready' && message.playback).length,3);
  assert.deepEqual(states,[{enabled:true,bufferMs:200,underruns:0}]);
  context.currentTime=2;audio.receive(packet(1));
  assert.deepEqual(states.at(-1),{enabled:true,bufferMs:200,underruns:1});assert.equal(states.length,2);
  audio.setBuffer(400);assert.deepEqual(states.at(-1),{enabled:true,bufferMs:400,underruns:1});
  audio.disable();assert.deepEqual(states.at(-1),{enabled:false,bufferMs:400,underruns:1});
  const count=states.length;audio.heartbeat();audio.disable();assert.equal(states.length,count);
  await audio.enable();assert.equal(states.length,count+1);assert.equal(states.at(-1).enabled,true);
  audio.close();
});

test('caller changes to a reported state do not invalidate change detection',async()=>{
  const{audio,states}=fixture();await audio.enable();
  states[0].enabled=false;audio.heartbeat();assert.equal(states.length,1);
  audio.disable();assert.equal(states.length,2);audio.close();
});
