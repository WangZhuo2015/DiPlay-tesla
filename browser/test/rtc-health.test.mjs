import test from 'node:test';
import assert from 'node:assert/strict';
import {createRtcHealth} from '../src/main/assets/tesla/rtc-health.js';

test('two minutes of stationary CarPlay do not cause a video fallback',()=>{
  const health=createRtcHealth(0);health.source(1,0);
  for(let now=1000;now<=120000;now+=1000)assert.equal(health.sample(1,now,true),false);
});
test('fresh source frames with a stalled decoder trigger fallback, then progress recovers',()=>{
  const health=createRtcHealth(0);health.sample(1,0,true);
  health.source(20,6000);assert.equal(health.sample(1,6000,true),true);
  assert.equal(health.sample(2,6000,true),false);
});
test('a peer that never plays falls back after ten seconds',()=>{
  const health=createRtcHealth(0);assert.equal(health.sample(0,11000,false),true);
});
