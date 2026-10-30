import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserAudio,createAudioPreference,decodeAudioPacket,normalizeAudioVolume} from '../src/main/assets/tesla/browser-audio.js';

function packet(stream,rate=48000,channels=2,frames=960,role=0) {
  const bytes=new ArrayBuffer(20+frames*channels*2),header=new DataView(bytes);
  header.setUint32(0,0x31415057,true);header.setInt32(4,stream,true);header.setUint32(8,rate,true);header.setUint16(12,channels,true);
  header.setUint16(14,role,true);
  new Int16Array(bytes,20).fill(16384);return bytes;
}
function fixture(volumes={}) {
  const started=[],messages=[],gains=[];
  const context={state:'running',currentTime:0,resume:async()=>{},close:async()=>{},destination:{},
    createGain(){const node={gain:{value:1,events:[],cancelAndHoldAtTime(time){this.events.push(['hold',time]);},
      linearRampToValueAtTime(value,time){this.value=value;this.events.push(['ramp',value,time]);}},
      connect(target){this.target=target;},disconnect(){this.disconnected=true;}};gains.push(node);return node;},
    createBuffer(channels,count,rate){const data=Array.from({length:channels},()=>new Float32Array(count));return{rate,getChannelData:i=>data[i]};},
    createBufferSource(){return{connect(target){this.target=target;},disconnect(){this.disconnected=true;},stop(){this.stopped=true;},start(time){this.time=time;started.push(this);}};}};
  const audio=createBrowserAudio({volumes,createContext:()=>context,send:data=>messages.push(data)});
  return{audio,context,started,messages,gains};
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

test('volume normalization preserves safe defaults, clamps values and rejects malformed storage',()=>{
  for(const value of [undefined,null,'','  ','NaN','Infinity',NaN,Infinity,{},true])assert.equal(normalizeAudioVolume(value),100);
  for(const [value,expected] of [['0',0],['35',35],[-5,0],[150,100],[24.6,25]])assert.equal(normalizeAudioVolume(value),expected);
});

test('roles select independent gains regardless of stream order; PCM and legacy audio are unchanged',async()=>{
  const{audio,context,started,gains}=fixture({music:35,navigation:80});await audio.enable();
  const navigation=packet(91,24000,1,480,2),music=packet(92,48000,2,960,1);
  assert.equal(decodeAudioPacket(navigation).role,2);
  audio.receive(navigation);audio.receive(music);audio.receive(packet(1));audio.receive(packet(2,48000,2,960,99));
  assert.equal(started[0].target,gains[1]);assert.equal(started[1].target,gains[0]);
  assert.equal(gains[0].gain.value,.35);assert.equal(gains[1].gain.value,.8);
  assert.ok(gains.every(gain=>gain.target===context.destination));
  assert.equal(started[2].target,context.destination);assert.equal(started[3].target,context.destination);
  assert.equal(started[0].buffer.getChannelData(0)[0],.5);assert.equal(new Int16Array(navigation,20)[0],16384);
  assert.equal(started[1].buffer.getChannelData(0)[0],.5);audio.close();
});

test('live volume ramps affect already queued music only and zero does not release playback',async()=>{
  const{audio,started,messages,gains,context}=fixture();await audio.enable();
  audio.receive(packet(17,48000,2,960,1));audio.receive(packet(18,24000,1,480,2));
  const before=messages.length;context.currentTime=.1;
  assert.equal(audio.setVolume('music',0),0);
  assert.deepEqual(gains[0].gain.events,[['hold',.1],['ramp',0,.13]]);
  assert.equal(gains[1].gain.value,1);assert.equal(started[0].target.gain.value,0);
  assert.equal(audio.enabled,true);assert.ok(started.every(node=>!node.stopped));assert.equal(messages.length,before);
  audio.receive(packet(17,48000,2,960,1));assert.equal(messages.at(-1).type,'audio-ack');
  assert.equal(audio.setVolume('navigation',60),60);assert.equal(gains[1].gain.value,.6);assert.equal(gains[0].gain.value,0);
  assert.equal(audio.setVolume('unknown',10),null);assert.equal(audio.setVolume('__proto__',10),null);
  const copy=audio.volumes;copy.music=100;assert.equal(audio.volumes.music,0);audio.close();
});

test('volume preferences survive stops, starvation, buffer changes, disable and context recreation',async()=>{
  const{audio,context,started,gains}=fixture();audio.setVolume('music',42);await audio.enable();
  audio.receive(packet(7,48000,2,960,1));audio.receive(packet(8,24000,1,480,2));
  context.currentTime=.3;audio.receive(packet(8,24000,1,480,2));
  assert.equal(started[0].stopped,undefined);assert.equal(started.at(-1).target,gains[1]);
  audio.stopped(7);audio.setBuffer(80);audio.disable();await audio.enable();
  audio.receive(packet(33,48000,2,960,1));assert.equal(started.at(-1).target.gain.value,.42);
  audio.close();assert.ok(gains.every(gain=>gain.disconnected));assert.ok(started.every(node=>node.disconnected));
  await audio.enable();audio.receive(packet(34,48000,2,960,1));
  assert.equal(started.at(-1).target.gain.value,.42);assert.equal(gains.length,4);audio.close();
});

test('browsers without cancelAndHoldAtTime use the bounded ramp fallback',async()=>{
  const{audio,gains}=fixture();await audio.enable();const parameter=gains[0].gain;
  delete parameter.cancelAndHoldAtTime;
  parameter.cancelScheduledValues=time=>parameter.events.push(['cancel',time]);
  parameter.setValueAtTime=(value,time)=>parameter.events.push(['set',value,time]);
  audio.setVolume('music',50);
  assert.deepEqual(parameter.events,[['cancel',0],['set',1,0],['ramp',.5,.03]]);audio.close();
});
