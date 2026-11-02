import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerTransport} from '../src/main/assets/tesla/media-worker.js';
import {WorkerMediaSocket} from '../src/main/assets/tesla/media-socket.js';

function packet(sequence=1,role=1) {
  const data=new ArrayBuffer(3860),header=new DataView(data);
  header.setUint32(0,0x31415057,true);header.setInt32(4,1,true);header.setUint32(8,48000,true);
  header.setUint16(12,2,true);header.setUint16(14,role,true);header.setUint32(16,sequence,true);
  return data;
}
function fixture() {
  const messages=[],sent=[];let clock=0,tick=null,cancelled=false;
  const socket={readyState:0,send:data=>sent.push(JSON.parse(data)),
    close(){this.readyState=3;this.onclose?.();}};
  const worker=createWorkerTransport({post:(message,transfer=[])=>messages.push(structuredClone(message,{transfer})),
    createSocket:()=>socket,clock:()=>clock,every:fn=>{tick=fn;return 1;},cancel:()=>{cancelled=true;}});
  worker.command({type:'open',url:'wss://fixture.test/api/media'});
  socket.readyState=1;socket.onopen();
  function port() {
    return {messages:[],started:false,closed:false,
      postMessage(message,transfer=[]){this.messages.push(structuredClone(message,{transfer}));},
      start(){this.started=true;},close(){this.closed=true;}};
  }
  function bind(epoch=1) {
    const output=port();
    worker.command({type:'audio-port',port:output,epoch,playback:true,bufferMs:200,sampleRate:48000});
    return output;
  }
  return {worker,socket,messages,sent,bind,
    advance(ms){clock+=ms;tick();},get cancelled(){return cancelled;}};
}

test('worker acknowledges and transfers PCM directly to playback without a UI packet callback',()=>{
  const f=fixture();
  try {
    const port=f.bind(),data=packet(42);
    f.socket.onmessage({data});
    assert.equal(data.byteLength,0);
    assert.equal(port.messages.at(-1).type,'pcm');
    assert.equal(port.messages.at(-1).buffer.byteLength,3860);
    assert.deepEqual(f.sent.at(-1),{type:'audio-ack',sequence:42});
    assert.equal(f.messages.filter(m=>m.type==='message').length,0);
    f.socket.onmessage({data:JSON.stringify({type:'audio-stop',stream:1})});
    assert.deepEqual(port.messages.at(-1),{type:'stop',stream:1});
    f.socket.onmessage({data:JSON.stringify({type:'rtc-offer',id:1,sdp:'synthetic'})});
    assert.equal(JSON.parse(f.messages.at(-1).data).type,'rtc-offer');
  } finally {f.worker.dispose();}
});

test('heartbeat and readiness run without the main thread, but suspended playback loses readiness',()=>{
  const f=fixture();
  try {
    const port=f.bind();
    port.onmessage({data:{type:'stats',queuedMs:200,underruns:0}});
    f.advance(1000);
    assert.deepEqual(f.sent.slice(-2),[{type:'ping'},{type:'audio-ready',playback:true}]);
    f.advance(1000);
    assert.deepEqual(f.sent.at(-1),{type:'audio-ready',playback:false});
    assert.equal(port.closed,true);
    assert.deepEqual(f.messages.at(-1),{type:'audio-error',epoch:1,reason:'render-stalled'});
    f.worker.command({type:'send',data:JSON.stringify({type:'ping'})});
    assert.equal(f.sent.filter(m=>m.type==='ping').length,2);
  } finally {f.worker.dispose();}
  assert.equal(f.cancelled,true);
});

test('compatibility playback keeps the same socket and rejects stale detached playback reports',()=>{
  const f=fixture();
  try {
    const port=f.bind(),late=port.onmessage;
    f.worker.command({type:'audio-detach'});
    assert.equal(port.closed,true);
    late({data:{type:'stats',queuedMs:999,underruns:99}});
    assert.equal(f.messages.filter(m=>m.type==='audio-stats').length,0);
    f.socket.onmessage({data:packet(7)});
    assert.equal(f.messages.at(-1).type,'message');
    f.worker.command({type:'send',data:JSON.stringify({type:'audio-ready',playback:true})});
    assert.deepEqual(f.sent.at(-1),{type:'audio-ready',playback:true});
  } finally {f.worker.dispose();}
});

test('invalid worker PCM explicitly disables forwarding and publishes an audio error',()=>{
  const f=fixture();
  try {
    const port=f.bind();
    f.socket.onmessage({data:new ArrayBuffer(24)});
    assert.deepEqual(f.messages.at(-1),{type:'audio-error',epoch:1,reason:'invalid-packet'});
    assert.equal(port.closed,true);
    assert.deepEqual(f.sent.at(-1),{type:'audio-ready',playback:false});
  } finally {f.worker.dispose();}
});

test('socket proxy fences old audio epochs and terminates its worker on close',()=>{
  const commands=[],stats=[];
  const worker={postMessage:(message,transfer)=>commands.push({message,transfer}),terminate(){this.terminated=true;}};
  const socket=new WorkerMediaSocket('wss://fixture.test/api/media',()=>worker);
  worker.onmessage({data:{type:'open'}});socket.onaudiostats=value=>stats.push(value);
  const port={};socket.bindAudio(port,{bufferMs:200,sampleRate:48000,playback:true});
  assert.deepEqual(commands.at(-1).transfer,[port]);
  worker.onmessage({data:{type:'audio-stats',epoch:1,stats:{queuedMs:200}}});
  socket.unbindAudio();
  worker.onmessage({data:{type:'audio-stats',epoch:1,stats:{queuedMs:999}}});
  assert.deepEqual(stats,[{queuedMs:200}]);
  let closed=0;socket.onclose=()=>closed++;
  socket.close();socket.close();
  worker.onmessage({data:{type:'open'}});
  assert.equal(socket.readyState,3);assert.equal(closed,1);assert.equal(worker.terminated,true);
});

test('asynchronous worker loading failure closes the owning socket and reports fallback availability',()=>{
  let failed=0,closed=0;
  const worker={postMessage(){},terminate(){this.terminated=true;}};
  const socket=new WorkerMediaSocket('wss://fixture.test/api/media',()=>worker,()=>failed++);
  socket.onclose=()=>closed++;
  worker.onerror();worker.onerror();
  assert.equal(failed,1);assert.equal(closed,1);assert.equal(worker.terminated,true);
});

test('a worker whose first command throws is terminated before compatibility transport can open',()=>{
  const worker={postMessage(){throw new Error('Worker cannot load');},terminate(){this.terminated=true;}};
  assert.throws(()=>new WorkerMediaSocket('wss://fixture.test/api/media',()=>worker),/Worker cannot load/);
  assert.equal(worker.terminated,true);
});
