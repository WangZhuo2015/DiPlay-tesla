import test from 'node:test';
import assert from 'node:assert/strict';
import {createTouchSender} from '../src/main/assets/tesla/browser-touch.js';
const point={id:0,x:.04,y:.6,down:true};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('a quick dock tap survives an earlier request and releases at the same coordinates',async()=>{
  const sent=[],complete=[];
  const sender=createTouchSender({send:contacts=>{sent.push(contacts);return new Promise(resolve=>complete.push(resolve));}});
  sender.transition([]); // An earlier release is still on the network.
  sender.transition([point]);
  sender.transition([{...point,down:false}]);
  complete.shift()();await tick();
  assert.deepEqual(sent[1],[point]);
  complete.shift()();await tick();
  assert.deepEqual(sent[2],[{...point,down:false}]);
  complete.shift()();await tick();
});

test('motion is coalesced while both fingers retain their press and release boundaries',async()=>{
  const sent=[],complete=[];
  const sender=createTouchSender({send:contacts=>{sent.push(contacts);return new Promise(resolve=>complete.push(resolve));}});
  const second={id:1,x:.8,y:.6,down:true};
  sender.transition([point]);
  sender.motion([{...point,x:.1}]);sender.motion([{...point,x:.2}]);
  sender.transition([point,second]);
  sender.transition([{...point,down:false},second]);
  sender.motion([{...second,x:.9}]);
  sender.transition([{...second,x:.9,down:false}]);
  while(complete.length){complete.shift()();await tick();}
  assert.deepEqual(sent,[ [point], [{...point,x:.2}], [point,second], [{...point,down:false},second], [{...second,x:.9}], [{...second,x:.9,down:false}] ]);
});

test('cancel drops unsent taps and releases an in-flight press',async()=>{
  const sent=[],complete=[];
  const sender=createTouchSender({send:contacts=>{sent.push(contacts);return new Promise(resolve=>complete.push(resolve));}});
  sender.transition([point]);sender.transition([{...point,down:false}]);sender.transition([point]);
  sender.cancel();
  complete.shift()();await tick();
  assert.deepEqual(sent,[[point],[]]);
  complete.shift()();await tick();
});

test('a failed request clears pending input and attempts a bounded cancel',async()=>{
  const sent=[];let errors=0;
  const sender=createTouchSender({send:async contacts=>{sent.push(contacts);if(contacts.length)throw new Error('offline');},onError:()=>errors++});
  sender.transition([point]);sender.transition([{...point,down:false}]);
  await tick();
  assert.equal(errors,1);assert.deepEqual(sent,[[point],[]]);
});

test('a new tap during failure cancellation resumes without a move or heartbeat',async()=>{
  const sent=[];let completeCancel;
  const sender=createTouchSender({send:contacts=>{
    sent.push(contacts);
    if(sent.length===1)return Promise.reject(new Error('offline'));
    if(sent.length===2)return new Promise(resolve=>{completeCancel=resolve;});
    return Promise.resolve();
  }});
  sender.transition([point]);await tick();
  sender.transition([point]);sender.transition([{...point,down:false}]);
  completeCancel();await tick();
  assert.deepEqual(sent,[[point],[],[point],[{...point,down:false}]]);
});
