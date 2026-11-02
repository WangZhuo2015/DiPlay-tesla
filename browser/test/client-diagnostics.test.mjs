import test from 'node:test';
import assert from 'node:assert/strict';
import {createClientDiagnostics,diagnosticFields} from '../src/main/assets/tesla/client-diagnostics.js';

const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(send=async()=>({ok:true})) {
  let time=0,token='paired';
  const batches=[],warnings=[];
  const diagnostics=createClientDiagnostics({client:'1234abcd',getToken:()=>token,now:()=>time,wallNow:()=>1000+time,
    context:()=>({visibility:'visible',focused:true}),warn:()=>warnings.push(true),
    send:async(body,auth)=>{batches.push({body:JSON.parse(body),auth});return send();}});
  return {diagnostics,batches,warnings,advance:ms=>{time+=ms;},unpair:()=>{token='';}};
}

test('samples use the existing tick at most every five seconds and omit private/error payloads',async()=>{
  const f=fixture();
  for(let i=0;i<50;i++) {
    await f.diagnostics.sample({decodedFrames:i},{enabled:true,contextState:'running'});
    f.advance(100);
  }
  assert.equal(f.batches.length,1);
  assert.equal(f.batches[0].body.events.length,2);
  f.advance(1);await f.diagnostics.sample({decodedFrames:50},{enabled:true});
  assert.equal(f.batches.length,2);
  assert.deepEqual(diagnosticFields({reason:'page-hidden',errorName:'TypeError',url:'https://private',
    token:'private',message:'private',httpStatus:503,decodedFps:NaN,request:'https://private'}),
  {reason:'page-hidden',errorName:'TypeError',httpStatus:503});
});

test('failed uploads retain ordered events within a fixed bound and report dropped events on recovery',async()=>{
  let fail=true;
  const f=fixture(async()=>{if(fail)throw new Error('offline');return {ok:true};});
  f.diagnostics.record('page-start');await f.diagnostics.flush();
  for(let i=0;i<100;i++)f.diagnostics.record('canvas-clear',{reason:'stream-error'});
  f.advance(5000);await f.diagnostics.flush();
  assert.equal(f.warnings.length,1);
  fail=false;f.advance(5000);await f.diagnostics.flush(true);await settle();
  const recovered=f.batches.slice(2).flatMap(batch=>batch.body.events);
  assert.equal(recovered.length,64);
  assert.equal(recovered[0].seq,38);assert.equal(recovered.at(-1).seq,101);
  assert.equal(f.batches[2].body.dropped,37);
  assert.ok(f.batches.every(batch=>batch.body.events.length<=8));
});

test('a hide event during an in-flight upload is flushed immediately afterwards without parallel requests',async()=>{
  let release,calls=0,active=0,maximum=0;
  const f=fixture(async()=>{
    active++;maximum=Math.max(maximum,active);
    if(++calls===1)await new Promise(resolve=>{release=resolve;});
    active--;return {ok:true};
  });
  f.diagnostics.record('page-start');const first=f.diagnostics.flush();
  f.diagnostics.record('visibilitychange',{visibility:'hidden'});
  f.diagnostics.record('media-close',{reason:'page-hidden'});
  await f.diagnostics.flush(true);
  assert.equal(calls,1);
  release();await first;await settle();
  assert.equal(maximum,1);assert.equal(calls,2);
  assert.equal(f.batches[1].body.events[1].data.reason,'page-hidden');
  f.unpair();f.diagnostics.record('pagehide');await f.diagnostics.flush(true);
  assert.equal(calls,2);
});
