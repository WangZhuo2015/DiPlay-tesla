import test from 'node:test';
import assert from 'node:assert/strict';
import {streamSummary,createJpegMetrics} from '../src/main/assets/tesla/stream-summary.js';
const labels={stale:'Not updated'};
test('stream summary groups actual video size, decoded fps and a named SoC sensor',()=>{
  assert.deepEqual(streamSummary({transport:'H.264 / WebRTC',width:960,height:504,fps:19.9,
    device:{ageMs:100,batteryCelsius:25,thermalSensors:[{name:'gpu-thmzone',celsius:58},{name:'soc-thmzone',celsius:55.25}]}},labels),
    ['H.264 / WebRTC','960 × 504','19.9 fps','SoC 55.3 °C']);
});
test('unavailable video counters are explicit and distinct from a measured zero',()=>{
  const labels={unknown:'Unknown',stale:'Not updated'};
  assert.deepEqual(streamSummary({transport:'Waiting for video',width:0,height:0,fps:null},labels),['Waiting for video','Unknown','fps: Unknown']);
  for(const fps of [undefined,NaN,-1])assert.equal(streamSummary({transport:'JPEG',width:320,height:240,fps},labels).at(-1),'fps: Unknown');
  assert.equal(streamSummary({transport:'JPEG',width:320,height:240,fps:0},labels).at(-1),'0.0 fps');
});
test('JPEG measurements require a decoded image and a real sampling window, expire on loss and reset across routes',()=>{
  let clock=0;const metrics=createJpegMetrics(()=>clock);
  metrics.activity();clock=2000;assert.deepEqual(metrics.sample(),{width:0,height:0,fps:null});
  metrics.frame(800,480);assert.equal(metrics.sample().fps,null);
  clock=2500;metrics.frame(800,480);clock=3000;
  assert.deepEqual(metrics.sample(),{width:800,height:480,fps:2});
  clock=4000;metrics.activity();assert.equal(metrics.sample().fps,0);
  clock=10001;assert.deepEqual(metrics.sample(),{width:0,height:0,fps:null});
  metrics.reset();metrics.frame(960,540);assert.equal(metrics.sample().fps,null);
});
test('stale samples and missing video metrics are not presented as current measurements',()=>{
  assert.deepEqual(streamSummary({transport:'JPEG',width:0,height:0,fps:null,device:{ageMs:7000,thermalSensors:[{name:'soc-thmzone',celsius:55}]}},labels),['JPEG','SoC Not updated']);
  assert.deepEqual(streamSummary({transport:'JPEG',width:320,height:240,fps:0,device:{ageMs:0,batteryCelsius:25,thermalSensors:[]}},labels),['JPEG','320 × 240','0.0 fps']);
});
