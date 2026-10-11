import test from 'node:test';
import assert from 'node:assert/strict';
import {streamSummary} from '../src/main/assets/tesla/stream-summary.js';
const labels={battery:'Battery',stale:'Not updated'};
test('stream summary groups actual video size, decoded fps and separately named temperatures',()=>{
  assert.deepEqual(streamSummary({transport:'H.264 / WebRTC',width:960,height:504,fps:19.9,
    device:{ageMs:100,batteryCelsius:25,thermalSensors:[{name:'gpu-thmzone',celsius:58},{name:'soc-thmzone',celsius:55.25}]}},labels),
    ['H.264 / WebRTC','960 × 504','19.9 fps','SoC 55.3 °C','Battery 25.0 °C']);
});
test('stale samples and missing video metrics are not presented as current measurements',()=>{
  assert.deepEqual(streamSummary({transport:'JPEG',width:0,height:0,fps:null,device:{ageMs:7000,batteryCelsius:25}},labels),['JPEG','Battery Not updated']);
  assert.deepEqual(streamSummary({transport:'JPEG',width:320,height:240,fps:0,device:{ageMs:0,batteryCelsius:NaN}},labels),['JPEG','320 × 240','0.0 fps','Battery Not updated']);
});
