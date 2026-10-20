import test from 'node:test';
import assert from 'node:assert/strict';
import {createRtcHealth} from '../src/main/assets/tesla/rtc-health.js';

test('two minutes of stationary CarPlay do not cause a video fallback',()=>{
  const health=createRtcHealth(0);health.source(1,0);
  for(let now=1000;now<=120000;now+=1000)assert.equal(health.sample(1,now,true),false);
});
for (const grace of [4000,10000,30000]) {
  test(`${grace} ms: quiet-to-active video receives the full decoder recovery budget`,()=>{
    const health=createRtcHealth(0,grace);health.source(1,0);health.sample(1,0,true);
    for(let now=1000;now<=60000;now+=1000)assert.equal(health.sample(1,now,true),false);
    for(let elapsed=0;elapsed<grace;elapsed+=1000) {
      health.source(2+elapsed/1000,60000+elapsed);
      assert.equal(health.sample(1,60000+elapsed,true),false);
    }
    health.source(2+grace/1000,60000+grace);
    assert.equal(health.sample(1,60000+grace,true),true);
    assert.equal(health.sample(2,60000+grace,true),false);
    assert.equal(health.recovering(60000+grace),false);
  });
  test(`${grace} ms: a temporary disconnect preserves the peer and cannot extend its own deadline`,()=>{
    const health=createRtcHealth(0,grace);health.sample(1,0,true);
    health.disconnected(1000);health.disconnected(2000);
    assert.equal(health.recovering(2000),true);
    assert.equal(health.expired(1000+grace-1,true),false);
    assert.equal(health.expired(1000+grace,true),true);
    health.connected(1000+grace);
    assert.equal(health.expired(1000+grace,true),false);
    assert.equal(health.recovering(1000+grace),false);
    health.disconnected(2000+grace);
    assert.equal(health.expired(3000+grace,true),false);
  });
  test(`${grace} ms: transient getStats failures retry and success resets their deadline`,()=>{
    const health=createRtcHealth(0,grace);health.sample(1,0,true);
    health.statsFailed(1000);health.statsFailed(2000);
    assert.equal(health.expired(grace,true),false);
    assert.equal(health.expired(1000+grace,true),true);
    health.statsRecovered();
    assert.equal(health.expired(1000+grace,true),false);
    health.statsFailed(2000+grace);
    assert.equal(health.expired(3000+grace,true),false);
  });
  test(`${grace} ms: first frame has a bounded wait of at least ten seconds`,()=>{
    const health=createRtcHealth(0,grace),deadline=Math.max(10000,grace);
    assert.equal(health.sample(0,deadline-1,false),false);
    assert.equal(health.sample(0,deadline,false),true);
  });
}
test('source pauses and replacement receiver counters cancel a previous stall',()=>{
  const health=createRtcHealth(0,4000);health.sample(10,0,true);
  for(let now=1000;now<=3000;now+=1000){health.source(now/1000,now);health.sample(10,now,true);}
  assert.equal(health.recovering(3000),true);
  assert.equal(health.sample(10,6000,true),false);
  health.source(4,7000);
  assert.equal(health.sample(10,7000,true),false);
  assert.equal(health.sample(0,7000,true),false);
  assert.equal(health.recovering(7000),false);
  health.source(0,8000);
  assert.equal(health.expired(8000,true),false);
});
test('each new peer owns its timers and unknown policies fall back to ten seconds',()=>{
  const old=createRtcHealth(0,4000);old.disconnected(1000);old.statsFailed(1000);
  const next=createRtcHealth(6000,Number.MAX_VALUE);
  assert.equal(old.expired(7000,true),true);
  assert.equal(next.expired(7000,true),false);
  assert.equal(next.graceMs,10000);
});
