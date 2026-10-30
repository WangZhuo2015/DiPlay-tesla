import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigationVolume} from '../src/main/assets/tesla/navigation-volume.js';
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture() {
  const requests=[],states=[];
  const control=createNavigationVolume({save:body=>new Promise((resolve,reject)=>requests.push({body,resolve,reject})),onState:state=>states.push(state)});
  return {control,requests,state:()=>states.at(-1)};
}
test('rapid buttons and slider gestures serialize and coalesce without losing the latest intent',async()=>{
  const f=fixture();f.control.observe(-10);
  f.control.step(-1);f.control.step(-1);f.control.set(-18);f.control.step(1);
  assert.equal(f.requests.length,1);assert.equal(f.state().value,-17);
  assert.deepEqual(f.requests[0].body,{db:-11,expectedDb:-10});
  f.requests[0].resolve({value:-11});await flush();
  assert.deepEqual(f.requests[1].body,{db:-17,expectedDb:-11});
  f.requests[1].resolve({value:-17});await flush();
  assert.equal(f.state().busy,false);assert.equal(f.state().value,-17);
});
test('stale reads cannot overwrite pending or newly acknowledged changes; other clients synchronize on a fresh read',async()=>{
  const f=fixture();f.control.observe(-10);const oldEpoch=f.control.epoch;
  f.control.set(-6);f.control.observe(-20,f.control.epoch);
  assert.equal(f.state().value,-6);
  f.requests[0].resolve({value:-6});await flush();
  f.control.observe(-10,oldEpoch);assert.equal(f.state().value,-6);
  f.control.observe(-12,f.control.epoch);assert.equal(f.state().value,-12);
});
test('another client winning the compare-and-save cancels queued gestures and shows the server level',async()=>{
  const f=fixture();f.control.observe(-10);f.control.set(-8);f.control.set(-5);
  f.requests[0].resolve({value:-14,conflict:true});await flush();
  assert.equal(f.requests.length,1);assert.equal(f.state().value,-14);assert.equal(f.state().issue,'conflict');
  f.control.step(1);assert.deepEqual(f.requests[1].body,{db:-13,expectedDb:-14});
  f.requests[1].resolve({value:-13});await flush();assert.equal(f.state().issue,null);
});
test('an uncertain failed write requires a fresh read and never retries automatically',async()=>{
  const f=fixture();f.control.observe(-10);f.control.set(-8);f.control.set(-5);
  const stale=f.control.epoch;
  f.requests[0].reject(new Error('timeout'));await flush();
  assert.equal(f.state().ready,false);assert.equal(f.state().issue,'failed');
  f.control.set(-3);assert.equal(f.requests.length,1);
  f.control.observe(-10,stale);assert.equal(f.state().ready,false);
  f.control.observe(-8);assert.equal(f.state().value,-8);
  f.control.step(1);assert.deepEqual(f.requests[1].body,{db:-7,expectedDb:-8});
});
test('disconnect and reconnect fence late writes, and unknown/invalid values never become zero',async()=>{
  const f=fixture();f.control.observe(undefined);assert.equal(f.state().ready,false);
  f.control.observe(-10);f.control.set(-9);f.control.unavailable();
  f.requests[0].resolve({value:-9});await flush();assert.equal(f.state().ready,false);
  f.control.observe(-14);assert.equal(f.state().value,-14);
  for(const invalid of [null,NaN,0.5,1,-21,'-5'])f.control.set(invalid);
  assert.equal(f.requests.length,1);
  f.control.set(-20);f.control.step(-1);assert.equal(f.state().value,-20);
  f.requests[1].resolve({value:-20});await flush();
  f.control.step(100);assert.equal(f.state().value,0);
});
