import test from 'node:test';
import assert from 'node:assert/strict';
import {PcmPlayback} from '../src/main/assets/tesla/audio-worklet.js';

function packet({id=1,rate=48000,channels=2,frames=960,role=1,offset=0,frequency=1000}={}) {
  const buffer=new ArrayBuffer(20+frames*channels*2), view=new DataView(buffer);
  view.setUint32(0,0x31415057,true);view.setInt32(4,id,true);view.setUint32(8,rate,true);
  view.setUint16(12,channels,true);view.setUint16(14,role,true);
  const pcm=new Int16Array(buffer,20);
  for(let i=0;i<frames;i++)for(let c=0;c<channels;c++)
    pcm[i*channels+c]=Math.round(Math.sin(2*Math.PI*frequency*(offset+i)/rate)*8192);
  return buffer;
}
function render(player,frames) {
  const result=[[],[],[]];
  for(let at=0;at<frames;at+=128) {
    const size=Math.min(128,frames-at);
    const outputs=Array.from({length:3},()=>[new Float32Array(size),new Float32Array(size)]);
    player.process(outputs);
    for(let role=0;role<3;role++)result[role].push(...outputs[role][0]);
  }
  return result;
}
const rms=samples=>Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length);

test('continuous mixed-rate PCM retains pitch, independent roles, and packet-boundary continuity',()=>{
  const player=new PcmPlayback(48000);player.bufferMs=80;
  for(let i=0;i<20;i++) {
    assert.equal(player.receive(packet({rate:44100,frames:882,offset:i*882})),null);
    assert.equal(player.receive(packet({id:2,rate:24000,channels:1,frames:480,offset:i*480,role:2,frequency:500})),null);
  }
  const output=render(player,48000*.3);
  assert.equal(rms(output[2]),0);
  const start=48000*.1;
  for(let i=start;i<output[0].length;i++) {
    const expected=Math.sin(2*Math.PI*1000*(i-3840)/48000)*.25;
    assert.ok(Math.abs(output[0][i]-expected)<.003,'resampled music must not click at packet boundaries');
  }
  assert.ok(Math.abs(rms(output[1].slice(start))-.25/Math.sqrt(2))<.002);
  assert.equal(player.stats().underruns,0);
  assert.ok(player.stats().musicQueuedMs>170);
  assert.ok(player.stats().navigationQueuedMs>170);
});

test('downsampling filters content above the output Nyquist frequency instead of aliasing it',()=>{
  const player=new PcmPlayback(48000);player.bufferMs=80;
  for(let i=0;i<10;i++)player.receive(packet({rate:96000,frames:1920,offset:i*1920,frequency:30000}));
  const output=render(player,48000*.2)[0].slice(48000*.1);
  assert.ok(rms(output)<.003,'30 kHz must not become an audible 18 kHz tone');
});

test('downsampling retains sample debt when an odd packet ends exactly at a render boundary',()=>{
  const player=new PcmPlayback(48000);player.bufferMs=80;
  player.receive(packet({rate:96000,frames:65}));
  render(player,3840+33);
  assert.equal(player.streams.get(1).skip,1);
  player.receive(packet({rate:96000,frames:65,offset:65}));
  assert.equal(player.streams.get(1).count,64);
  render(player,32);
  assert.equal(player.streams.get(1).count,0);
  assert.equal(player.streams.get(1).skip,0);
  assert.equal(player.stats().underruns,0);
});

test('a genuine music gap resumes after a short prefill and counts only when more data returns',()=>{
  const player=new PcmPlayback(48000);player.bufferMs=400;
  player.receive(packet());render(player,48000*.5);
  assert.equal(player.stats().underruns,0);
  player.receive(packet({offset:960}));
  assert.equal(player.stats().musicUnderruns,1);
  assert.equal(player.stats().navigationUnderruns,0);
  const resumed=render(player,48000*.05)[0];
  assert.equal(rms(resumed.slice(0,960)),0);
  assert.ok(rms(resumed.slice(1200,1800))>.1);
  render(player,48000);
  assert.equal(player.stats().underruns,1);
  player.clear(1);player.receive(packet());assert.equal(player.stats().underruns,1);
});

test('guidance stop and starvation cannot cancel queued music',()=>{
  const player=new PcmPlayback(48000);player.bufferMs=80;
  for(let i=0;i<20;i++)player.receive(packet({offset:i*960}));
  player.receive(packet({id:2,role:2}));render(player,48000*.15);
  player.receive(packet({id:2,role:2}));
  assert.equal(player.stats().navigationUnderruns,1);
  assert.equal(player.stats().musicUnderruns,0);
  const queued=player.stats().musicQueuedMs;
  player.clear(2);
  assert.equal(player.stats().musicQueuedMs,queued);
  assert.ok(rms(render(player,960)[0])>.1);
});

test('backlog recovery drops stale queued PCM without disabling playback or growing rings',()=>{
  const player=new PcmPlayback(48000);
  for(let i=0;i<30;i++)player.receive(packet({offset:i*960}));
  const ring=player.streams.get(1).data;
  player.receive(packet({frames:12000}));
  assert.equal(player.stats().overruns,1);
  assert.equal(player.stats().musicQueuedMs,250);
  assert.equal(player.streams.get(1).data,ring);
  assert.ok(rms(render(player,4800)[0])>.1);
});

test('malformed packets and excessive live streams have explicit bounded errors',()=>{
  const player=new PcmPlayback(48000);
  assert.equal(player.receive(new ArrayBuffer(22)),'invalid-packet');
  assert.equal(player.receive(packet({rate:24000,channels:1,frames:15000})),'invalid-packet');
  for(let id=1;id<=8;id++)assert.equal(player.receive(packet({id})),null);
  assert.equal(player.receive(packet({id:9})),'stream-limit');
  assert.equal(player.streams.size,8);
});
