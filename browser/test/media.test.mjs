import test from 'node:test';
import assert from 'node:assert/strict';
import {createMedia} from '../src/main/assets/tesla/media.js';
import {createTouchSender} from '../src/main/assets/tesla/browser-touch.js';

const flush = async () => { for (let i=0;i<12;i++) await Promise.resolve(); };
function deferred() {
  let resolve,reject;
  const promise = new Promise((yes,no) => { resolve=yes; reject=no; });
  return {promise,resolve,reject};
}
function fixture({grace=4000,storedGrace=String(grace),storageBlocked=false,onTransport=()=>{}}={}) {
  const original = new Map(), timers = new Map(), sockets = [], peers = [], behaviors = [], snapshots = [], transports = [];
  const storage = new Map([['diplay-browser-audio','false'],['diplay-rtc-recovery-ms',storedGrace]]);
  let clock=0, timerId=0;
  function install(name,value) {
    original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  }
  function schedule(fn,delay,interval=false) {
    const id=++timerId; timers.set(id,{fn,at:clock+delay,interval:interval?delay:0}); return id;
  }
  class Socket {
    static OPEN=1;
    constructor(url) { this.url=url;this.readyState=0;this.sent=[];this.closeCalls=0;sockets.push(this); }
    send(value) { assert.equal(this.readyState,1);this.sent.push(JSON.parse(value)); }
    open() { this.readyState=1;this.onopen?.(); }
    message(value) { this.onmessage?.({data:JSON.stringify(value)}); }
    close() { this.closeCalls++;this.readyState=3;this.onclose?.(); }
  }
  class Peer {
    constructor() {
      this.behavior=behaviors.shift()||{};this.getStatsCalls=0;this.closeCalls=0;this.decoded=1;
      this.connectionState='new';this.iceGatheringState=this.behavior.gathering?'gathering':'complete';
      this.listeners=new Map();peers.push(this);
    }
    async setRemoteDescription(value) { this.remoteDescription=value;await this.behavior.remote; }
    async createAnswer() { await this.behavior.answer;return {type:'answer',sdp:this.behavior.answerSdp||'answer'}; }
    async setLocalDescription(value) { this.localDescription=value;await this.behavior.local; }
    getStats() {
      this.getStatsCalls++;
      return this.behavior.stats ? this.behavior.stats(this.getStatsCalls) : Promise.resolve(this.report());
    }
    report() { return new Map([['video',{type:'inbound-rtp',kind:'video',framesDecoded:this.decoded,framesDropped:2}]]); }
    addEventListener(name,fn) { this.listeners.set(name,fn); }
    removeEventListener(name,fn) { if(this.listeners.get(name)===fn)this.listeners.delete(name); }
    state(value) { this.connectionState=value;this.onconnectionstatechange?.(); }
    track(stream={name:'stream'}) { this.ontrack?.({streams:[stream],track:{}});return stream; }
    close() { this.closeCalls++;this.connectionState='closed';this.onconnectionstatechange?.(); }
  }
  const listeners=new Set(), video={srcObject:null,hidden:true,paused:true,readyState:0,videoWidth:0,playPromise:null,
    addEventListener(name,fn) { if(name==='playing')listeners.add(fn); },
    removeEventListener(name,fn) { if(name==='playing')listeners.delete(fn); },
    play() { this.paused=false;this.readyState=2;this.videoWidth=1280;this.emit();return this.playPromise||Promise.resolve(); },
    pause() { this.paused=true; },
    emit() { for(const fn of [...listeners])fn(); },
  };
  class AudioContext {
    constructor() { this.state='running';this.currentTime=0; }
    resume() { return Promise.resolve(); }
    close() { this.state='closed';return Promise.resolve(); }
  }
  install('WebSocket',Socket);install('RTCPeerConnection',Peer);
  install('MediaStream',class { constructor(tracks) { this.tracks=tracks; } });
  install('performance',{now:()=>clock});install('location',{protocol:'https:',host:'diplay.test'});
  install('document',{hidden:false});install('window',{AudioContext});
  install('localStorage',{getItem(key) { if(storageBlocked)throw new Error('Storage blocked');return storage.get(key)??null; },
    setItem(key,value) { if(storageBlocked)throw new Error('Storage blocked');storage.set(key,value); }});
  install('setTimeout',(fn,delay)=>schedule(fn,delay));install('clearTimeout',id=>timers.delete(id));
  install('setInterval',(fn,delay)=>schedule(fn,delay,true));install('clearInterval',id=>timers.delete(id));
  const media=createMedia({video,getToken:()=> 'paired-token',onStats:value=>snapshots.push(value),
    onTransport:value=>{transports.push(value);onTransport(value);}});
  media.open();sockets[0].open();
  async function advance(duration) {
    const until=clock+duration;
    while(true) {
      const next=[...timers.entries()].filter(([,value])=>value.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;
      const [id,timer]=next;clock=timer.at;
      if(timer.interval)timer.at+=timer.interval;else timers.delete(id);
      timer.fn();await flush();
    }
    clock=until;await flush();
  }
  async function offer(id=1,options={}) {
    behaviors.push(options);
    sockets.at(-1).message({type:'rtc-offer',id,sdp:'a=setup:actpass',recoveryGraceMs:grace});
    await flush();return peers.at(-1);
  }
  async function ready(id=1,options={}) {
    const peer=await offer(id,options);peer.state('connected');peer.track();await flush();
    assert.equal(media.displayed,true);return peer;
  }
  async function dispose() {
    media.dispose();await flush();
    for(const [name,descriptor] of original) {
      if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];
    }
  }
  return {media,video,listeners,sockets,peers,storage,snapshots,transports,timers,advance,offer,ready,dispose,
    fallback:()=>sockets.flatMap(ws=>ws.sent).filter(value=>value.type==='rtc-fallback'),
    stats:()=>snapshots.at(-1),messages:type=>sockets.flatMap(ws=>ws.sent).filter(value=>value.type===type)};
}

test('hello validates saved recovery settings and one configuration change reopens media only once',async()=>{
  const f=fixture({storedGrace:'999999'});
  try {
    assert.equal(f.messages('hello')[0].recoveryGraceMs,10000);
    assert.equal(f.media.recoveryGraceMs,10000);
    f.media.configureVideo('jpeg',4000);
    assert.equal(f.sockets.length,2);assert.equal(f.sockets[0].closeCalls,1);
    assert.equal(f.storage.get('diplay-video'),'jpeg');assert.equal(f.storage.get('diplay-rtc-recovery-ms'),'4000');
    f.sockets[1].open();assert.equal(f.messages('hello').at(-1).rtc,false);
    assert.equal(f.messages('hello').at(-1).recoveryGraceMs,4000);
    f.media.configureVideo('jpeg',4000);assert.equal(f.sockets.length,2);
    f.media.useVideo('auto');assert.equal(f.sockets.length,3);
    f.sockets[2].open();assert.equal(f.messages('hello').at(-1).recoveryGraceMs,4000);
  } finally { await f.dispose(); }
});

test('blocked browser storage keeps validated preferences in the active page',async()=>{
  const f=fixture({storageBlocked:true});
  try {
    assert.equal(f.media.recoveryGraceMs,10000);
    f.media.configureVideo('auto',30000);f.sockets.at(-1).open();
    assert.equal(f.media.recoveryGraceMs,30000);assert.equal(f.messages('hello').at(-1).recoveryGraceMs,30000);
  } finally { await f.dispose(); }
});

test('short WebRTC disconnects retain the last frame and resume without touching browser audio',async()=>{
  const f=fixture();
  try {
    const peer=await f.ready();await f.media.audio.enable();
    const stream=f.video.srcObject;peer.state('disconnected');
    await f.advance(3999);
    assert.equal(f.media.displayed,true);assert.equal(f.video.srcObject,stream);
    assert.equal(peer.closeCalls,0);assert.equal(f.stats().recovering,true);
    peer.state('connected');await f.advance(10001);
    assert.equal(f.media.displayed,true);assert.equal(f.stats().recovering,false);
    assert.equal(f.media.audio.enabled,true);assert.equal(f.fallback().length,0);
  } finally { await f.dispose(); }
});

test('the server-selected grace controls fallback and persistent disconnect preserves the audio socket',async()=>{
  const f=fixture({grace:4000,storedGrace:'30000'});
  try {
    const peer=await f.ready();await f.media.audio.enable();peer.state('disconnected');
    await f.advance(4000);
    assert.equal(f.stats().recoveryGraceMs,4000);assert.equal(f.stats().fallbackReason,'disconnected-timeout');
    assert.equal(f.media.displayed,false);assert.equal(f.fallback().length,1);
    assert.equal(f.sockets[0].closeCalls,0);assert.equal(f.media.audio.enabled,true);
  } finally { await f.dispose(); }
});

for(const terminal of ['failed','closed'])test(`${terminal} is terminal even with a thirty-second recovery policy`,async()=>{
  const f=fixture({grace:30000});
  try {
    const peer=await f.ready();peer.state(terminal);
    assert.equal(f.media.displayed,false);assert.equal(f.stats().fallbackReason,'connection-failed');
    assert.equal(f.fallback().length,1);
  } finally { await f.dispose(); }
});

for(const synchronous of [false,true])test(`getStats ${synchronous?'throws':'rejects'} transiently and retries on the same peer`,async()=>{
  const f=fixture();
  try {
    const peer=await f.ready(1,{stats(call) {
      if(call===1) { if(synchronous)throw new Error('temporary');return Promise.reject(new Error('temporary')); }
      return Promise.resolve(f.peers[0].report());
    }});
    await f.advance(1000);assert.equal(f.media.displayed,true);assert.equal(f.stats().recovering,true);
    await f.advance(1000);assert.equal(peer.getStatsCalls,2);assert.equal(f.stats().recovering,false);
    assert.equal(peer.closeCalls,0);assert.equal(f.fallback().length,0);
  } finally { await f.dispose(); }
});

test('a hanging getStats has one request in flight and a bounded fallback without stopping audio',async()=>{
  const f=fixture(),pending=deferred();
  try {
    const peer=await f.ready(1,{stats:()=>pending.promise});await f.media.audio.enable();
    await f.advance(4999);assert.equal(f.media.displayed,true);assert.equal(peer.getStatsCalls,1);
    await f.advance(1);assert.equal(f.media.displayed,false);assert.equal(f.stats().fallbackReason,'stats-timeout');
    assert.equal(peer.getStatsCalls,1);assert.equal(f.media.audio.enabled,true);
    f.sockets[0].message({type:'rtc-stop',id:1,reason:'browser-fallback'});
    assert.equal(f.stats().fallbackReason,'stats-timeout');
    pending.resolve(peer.report());await flush();assert.equal(f.media.displayed,false);
    assert.equal(f.fallback().length,1);
  } finally { await f.dispose(); }
});

test('a repeated same-id offer isolates a late SDP rejection from the replacement peer',async()=>{
  const f=fixture(),pending=deferred();
  try {
    const old=await f.offer(1,{remote:pending.promise});
    const replacement=await f.ready(1);
    pending.reject(new Error('old SDP rejected'));await flush();
    assert.equal(old.closeCalls,1);assert.equal(replacement.closeCalls,0);
    assert.equal(f.media.displayed,true);assert.equal(f.fallback().length,0);
    assert.equal(f.messages('rtc-answer').length,1);
  } finally { await f.dispose(); }
});

test('late stats rejection and a late native state callback cannot stop a replacement offer',async()=>{
  const f=fixture(),pending=deferred();
  try {
    const old=await f.ready(1,{stats:()=>pending.promise});
    const oldState=old.onconnectionstatechange;
    await f.advance(1000);
    const replacement=await f.ready(2);
    pending.reject(new Error('old stats rejected'));old.connectionState='failed';oldState();await flush();
    assert.equal(f.media.displayed,true);assert.equal(replacement.closeCalls,0);
    assert.equal(f.fallback().length,0);assert.equal(f.stats().fallbackReason,null);
  } finally { await f.dispose(); }
});

test('old socket open, message, and close callbacks cannot mutate the new media connection',async()=>{
  const f=fixture();
  try {
    await f.ready();
    const old=f.sockets[0],oldOpen=old.onopen,oldMessage=old.onmessage,oldClose=old.onclose;
    f.media.configureVideo('auto',30000);f.sockets[1].open();
    const replacement=await f.ready(2);
    oldOpen();oldMessage({data:JSON.stringify({type:'rtc-offer',id:3,sdp:'stale'})});oldClose();await flush();
    assert.equal(f.messages('hello').length,2);assert.equal(f.peers.length,2);
    assert.equal(replacement.closeCalls,0);assert.equal(f.media.displayed,true);
  } finally { await f.dispose(); }
});

test('playing and play promises are tied to the current stream; disposal removes listeners',async()=>{
  const f=fixture(),oldPlay=deferred(),newPlay=deferred();
  try {
    const old=await f.offer(1);f.video.playPromise=oldPlay.promise;old.track({name:'old'});
    const oldPlaying=[...f.listeners][0];
    const replacement=await f.offer(2);f.video.playPromise=newPlay.promise;replacement.track({name:'new'});
    oldPlaying();f.video.emit();oldPlay.resolve();await flush();
    assert.equal(f.media.displayed,false);assert.equal(f.messages('rtc-ready').length,0);
    newPlay.resolve();await flush();
    assert.equal(f.media.displayed,true);assert.deepEqual(f.messages('rtc-ready').map(value=>value.id),[2]);
    f.media.dispose();assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);
    f.video.emit();assert.equal(f.messages('rtc-ready').length,1);
  } finally { await f.dispose(); }
});

test('replacing an offer cancels its ICE gathering timer and listener',async()=>{
  const f=fixture();
  try {
    const old=await f.offer(1,{gathering:true});assert.equal(old.listeners.size,1);
    const replacement=await f.ready(2);assert.equal(old.listeners.size,0);
    await f.advance(5000);assert.equal(f.media.displayed,true);assert.equal(replacement.closeCalls,0);
    assert.equal(f.fallback().length,0);
  } finally { await f.dispose(); }
});

test('a new stream on the same peer refreshes presentation after its own playback starts',async()=>{
  const f=fixture(),pending=deferred();
  try {
    const peer=await f.ready();const first=f.video.srcObject;
    f.video.playPromise=pending.promise;peer.track({name:'replacement-stream'});
    assert.notEqual(f.video.srcObject,first);assert.equal(f.transports.filter(value=>value==='webrtc').length,1);
    pending.resolve();await flush();
    assert.equal(f.transports.filter(value=>value==='webrtc').length,2);
    assert.equal(f.listeners.size,1);assert.equal(f.media.displayed,true);
  } finally { await f.dispose(); }
});

test('browser decoder samples merge with server queue diagnostics and preserve null unsupported rates',async()=>{
  const f=fixture();
  try {
    const peer=await f.ready();
    f.sockets[0].message({type:'rtc-progress',id:1,sent:1,received:4,sendFailures:2,queueBudgetMs:50,
      queueFrames:2,queueBytes:100,expiredFrames:3,overflowFrames:5,keyframeSkips:7,invalidatedFrames:11,recovering:true});
    await f.advance(1000);
    assert.equal(f.stats().decodedFps,null);assert.equal(f.stats().dropped,2);assert.equal(f.stats().expiredFrames,3);
    peer.decoded=31;await f.advance(1000);
    assert.equal(f.stats().decodedFps,30);assert.equal(f.stats().queueBytes,100);assert.equal(f.stats().sendFailures,2);
    f.sockets[0].message({type:'rtc-stop',id:1,reason:'keyframe-timeout'});
    assert.equal(f.stats().fallbackReason,'keyframe-timeout');assert.equal(f.stats().expiredFrames,3);
    assert.equal(f.stats().decodedFps,null);assert.equal(f.stats().recovering,false);
  } finally { await f.dispose(); }
});

test('a failed or hanging stats read clears the previous fps while a stationary decoded stream measures zero',async()=>{
  const f=fixture({grace:10000});
  try {
    const peer=await f.ready();await f.advance(1000);
    peer.decoded=31;await f.advance(1000);assert.equal(f.stats().decodedFps,30);
    await f.advance(1000);assert.equal(f.stats().decodedFps,0);
    peer.behavior.stats=()=>Promise.reject(new Error('Counters unavailable'));
    await f.advance(1000);assert.equal(f.stats().decodedFps,null);assert.equal(f.stats().dropped,null);
    peer.behavior.stats=()=>Promise.resolve(peer.report());
    peer.decoded=61;await f.advance(1000);assert.ok(f.stats().decodedFps>0);
    peer.behavior.stats=()=>new Promise(()=>{});
    await f.advance(2000);assert.equal(f.stats().decodedFps,null);
    assert.equal(f.media.displayed,true);assert.equal(f.fallback().length,0);
  } finally { await f.dispose(); }
});

test('an offer whose negotiation never resolves still reaches its first-frame deadline',async()=>{
  const f=fixture(),pending=deferred();
  try {
    const peer=await f.offer(1,{remote:pending.promise});
    await f.advance(9999);assert.equal(peer.closeCalls,0);
    await f.advance(1);assert.equal(f.stats().fallbackReason,'first-frame-timeout');
    assert.equal(peer.closeCalls,1);assert.equal(f.fallback().length,1);
    pending.resolve();await flush();assert.equal(f.messages('rtc-answer').length,0);
  } finally { await f.dispose(); }
});

test('NotSupportedError playback rejection permanently stops this server attempt without socket/audio teardown',async()=>{
  const f=fixture();
  try {
    await f.media.audio.enable();
    const peer=await f.offer(1);
    f.video.playPromise=Promise.reject(Object.assign(new Error('unsupported playback'),{name:'NotSupportedError'}));
    peer.track();await flush();
    assert.deepEqual(f.fallback(),[{type:'rtc-fallback',id:1,retryable:false}]);
    assert.equal(f.stats().fallbackReason,'playback-failed');assert.equal(f.media.displayed,false);
    assert.equal(f.sockets[0].closeCalls,0);assert.equal(f.media.audio.enabled,true);
    f.sockets[0].message({type:'rtc-stop',id:1,reason:'browser-fallback',retryAfterMs:0,retryBlocked:true});
    assert.equal(f.stats().fallbackReason,'playback-failed');assert.equal(f.stats().rtcRetryBlocked,true);
    await f.advance(120000);
    assert.equal(f.peers.length,1);assert.equal(f.fallback().length,1);
  } finally { await f.dispose(); }
});

test('a current NotAllowedError remains retryable and playback can recover on the same audio/control socket',async()=>{
  const f=fixture();
  try {
    await f.media.audio.enable();
    const old=await f.offer(1);
    f.video.playPromise=Promise.reject(Object.assign(new Error('activation needed'),{name:'NotAllowedError'}));
    old.track();await flush();
    assert.deepEqual(f.fallback(),[{type:'rtc-fallback',id:1}]);
    f.sockets[0].message({type:'rtc-stop',id:1,reason:'browser-fallback',retryAfterMs:5000,retryBlocked:false});
    await f.advance(5000);
    f.video.playPromise=null;
    await f.ready(2);
    assert.equal(f.sockets.length,1);assert.equal(f.sockets[0].closeCalls,0);
    assert.equal(f.media.audio.enabled,true);assert.equal(f.media.displayed,true);
  } finally { await f.dispose(); }
});

test('JPEG retry negotiation and failure keep a held touch, but actual transport switches and control close release it',async()=>{
  const sent=[];
  const touch=createTouchSender({send:async contacts=>sent.push(contacts)});
  const point={id:0,x:.4,y:.6,down:true};
  const f=fixture({onTransport:()=>touch.cancel()});
  try {
    touch.transition([point]);await flush();
    const attempt=await f.offer(1);
    assert.deepEqual(sent,[[point]],'JPEG offer must not cancel the held input');
    attempt.state('failed');await flush();
    f.sockets[0].message({type:'rtc-stop',id:1,reason:'browser-fallback',retryAfterMs:5000});
    assert.deepEqual(sent,[[point]],'JPEG failure/ack must not cancel the held input');
    touch.motion([{...point,x:.5}]);await flush();
    assert.deepEqual(sent.at(-1),[{...point,x:.5}]);
    await f.advance(5000);
    const next=await f.ready(2);await flush();
    assert.deepEqual(sent.at(-1),[],'JPEG to displayed RTC must release input');
    touch.transition([point]);await flush();
    next.state('failed');await flush();
    assert.deepEqual(sent.at(-1),[],'RTC to JPEG must release input');
    touch.transition([point]);await flush();
    f.media.close();await flush();
    assert.deepEqual(sent.at(-1),[],'closing JPEG control ownership must also release input');
  } finally { await f.dispose(); }
});

test('an answer that disables video is a permanent rejection before local SDP or an answer is sent',async()=>{
  const f=fixture();
  try {
    const peer=await f.offer(1,{answerSdp:'v=0\r\nm=video 0 UDP/TLS/RTP/SAVPF 96\r\n'});
    assert.equal(peer.localDescription,undefined);assert.equal(peer.closeCalls,1);
    assert.equal(f.messages('rtc-answer').length,0);
    assert.deepEqual(f.fallback(),[{type:'rtc-fallback',id:1,retryable:false}]);
    assert.equal(f.stats().fallbackReason,'video-unsupported');
  } finally { await f.dispose(); }
});

test('a transient fallback accepts a server retry while late permanent failures stay on the retired peer',async()=>{
  const f=fixture(),pending=deferred();
  try {
    const old=await f.offer(1,{remote:pending.promise});
    await f.advance(10000);
    assert.equal(f.fallback().length,1);assert.equal(f.fallback()[0].retryable,undefined);
    f.sockets[0].message({type:'rtc-stop',id:1,reason:'browser-fallback',retryAfterMs:5000,retryBlocked:false});
    assert.equal(f.stats().rtcRetryAfterMs,5000);
    await f.advance(5000);
    const replacement=await f.ready(2);
    pending.reject(Object.assign(new Error('old codec failure'),{name:'NotSupportedError'}));await flush();
    f.sockets[0].message({type:'rtc-stop',id:1,reason:'browser-fallback',retryBlocked:true});
    assert.equal(old.closeCalls,1);assert.equal(replacement.closeCalls,0);
    assert.equal(f.media.displayed,true);assert.equal(f.fallback().length,1);
  } finally { await f.dispose(); }
});

test('closing or hiding the page while JPEG is waiting cannot create browser-owned RTC retries',async()=>{
  const f=fixture();
  try {
    const old=await f.ready();old.state('failed');
    f.sockets[0].message({type:'rtc-stop',id:1,reason:'browser-fallback',retryAfterMs:5000});
    const oldMessage=f.sockets[0].onmessage;
    document.hidden=true;f.media.close();
    await f.advance(120000);
    oldMessage({data:JSON.stringify({type:'rtc-offer',id:2,sdp:'stale'})});await flush();
    assert.equal(f.sockets.length,1);assert.equal(f.peers.length,1);assert.equal(f.media.displayed,false);
    document.hidden=false;f.media.open();f.sockets.at(-1).open();
    await f.ready(3);assert.equal(f.media.displayed,true);
  } finally { await f.dispose(); }
});
