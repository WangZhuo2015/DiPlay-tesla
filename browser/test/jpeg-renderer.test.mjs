import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {presentJpegFrame} from '../src/main/assets/tesla/media.js';
import {createRtcRenderer} from '../src/main/assets/tesla/rtc-renderer.js';
import {createTouchSender} from '../src/main/assets/tesla/browser-touch.js';
import {createNavigationVolume} from '../src/main/assets/tesla/navigation-volume.js';
import {streamSummary,createJpegMetrics} from '../src/main/assets/tesla/stream-summary.js';
import {displayPreset} from '../src/main/assets/tesla/display-presets.js';

const appSource = await readFile(new URL('../src/main/assets/tesla/app.js',import.meta.url),'utf8');
const flush = async () => { for(let index=0;index<20;index++)await Promise.resolve(); };

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes,no) => { resolve = yes; reject = no; });
  return {promise,resolve,reject};
}

function fixture() {
  const blob = {}, draws = [], sizes = [];
  let active = true, width = 1024, height = 768, reads = 0, decodes = 0, cancels = 0, closes = 0;
  const canvas = {
    get width() { return width; }, set width(value) { width = value; sizes.push(['width',value]); },
    get height() { return height; }, set height(value) { height = value; sizes.push(['height',value]); },
  };
  const picture = {width:1280,height:720,close() { closes++; }};
  const response = {blob:async () => { reads++; return blob; },body:{cancel:async () => { cancels++; }}};
  const drawing = {drawImage(...args) { draws.push(args); }};
  const args = {response,canvas,drawing,isCurrent:()=>active,decode:async value => {
    assert.equal(value,blob); decodes++; return picture;
  }};
  return {args,response,picture,draws,sizes,drawing,
    retire() { active = false; },
    get reads() { return reads; },get decodes() { return decodes; },get cancels() { return cancels; },get closes() { return closes; },
  };
}

test('obsolete JPEG responses cancel the body without allocating or decoding pixels',async () => {
  const f = fixture(); f.retire();
  assert.equal(await presentJpegFrame(f.args),false);
  assert.equal(f.cancels,1); assert.equal(f.reads,0); assert.equal(f.decodes,0);
  assert.deepEqual(f.draws,[]); assert.deepEqual(f.sizes,[]);
});

test('a takeover while the JPEG body is arriving skips image decoding',async () => {
  const f = fixture(), pending = deferred();
  f.response.blob = () => pending.promise;
  const displayed = presentJpegFrame(f.args);
  f.retire(); pending.resolve({});
  assert.equal(await displayed,false); assert.equal(f.decodes,0); assert.deepEqual(f.draws,[]);
});

test('a takeover during JPEG decoding closes the bitmap without resizing or drawing the shared canvas',async () => {
  const f = fixture(), pending = deferred(), entered = deferred();
  f.args.decode = () => { entered.resolve(); return pending.promise; };
  const displayed = presentJpegFrame(f.args); await entered.promise;
  f.retire(); pending.resolve(f.picture);
  assert.equal(await displayed,false); assert.equal(f.closes,1);
  assert.deepEqual(f.draws,[]); assert.deepEqual(f.sizes,[]);
});

test('same-size JPEG frames retain the backing store and every decoded bitmap is closed',async () => {
  const f = fixture();
  assert.equal(await presentJpegFrame(f.args),true);
  assert.equal(await presentJpegFrame(f.args),true);
  assert.deepEqual(f.sizes,[['width',1280],['height',720]]);
  assert.deepEqual(f.draws,[[f.picture,0,0],[f.picture,0,0]]);
  assert.equal(f.closes,2); assert.equal(f.decodes,2); assert.equal(f.cancels,0);
});

test('a canvas failure releases its decoded bitmap and preserves the failure for retry',async () => {
  const f = fixture(); f.drawing.drawImage = () => { throw new Error('draw failed'); };
  await assert.rejects(presentJpegFrame(f.args),/draw failed/);
  assert.equal(f.closes,1);
});

test('a failed stale body cancellation does not decode or disturb the replacement transport',async () => {
  const f = fixture(); f.retire(); f.response.body.cancel = async () => { throw new Error('closed'); };
  assert.equal(await presentJpegFrame(f.args),false); assert.equal(f.reads,0); assert.equal(f.decodes,0);
});

function appFixture({body,decode}) {
  const nodes = new Map(), draws = [], clears = [], timers = new Map();
  let timerId=0, frameRequests=0, onTransport, media;
  class Element {
    constructor() {
      this.hidden=false;this.value='';this.dataset={};
      this.classList={toggle(){},add(){},remove(){}};
    }
    addEventListener() {}
    setAttribute() {}
    replaceChildren() {}
    append() {}
    focus() {}
    querySelector() { return new Element(); }
    getContext() { return drawing; }
  }
  const drawing={drawImage:picture=>draws.push(picture),clearRect:()=>clears.push(true)};
  const node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  const video=node('video'),canvas=node('picture');
  Object.assign(video,{readyState:2,videoWidth:1280,videoHeight:720,currentTime:0,srcObject:null});
  Object.assign(canvas,{width:1280,height:720});
  const document={hidden:false,documentElement:new Element(),body:new Element(),
    getElementById:node,querySelectorAll:()=>[],addEventListener(){},
    createElement:()=>new Element(),createTextNode:text=>({textContent:text})};
  runInNewContext(appSource.replace(/^import .*;\r?$/gm,''),{
    document,Element,URLSearchParams,AbortController,queueMicrotask,
    navigator:{language:'en'},location:{search:'',hash:'',pathname:'/'},history:{replaceState(){}},
    crypto:{getRandomValues:bytes=>bytes.fill(1)},
    localStorage:{getItem:key=>key==='diplay-token'?'0'.repeat(32):null,setItem(){},removeItem(){}},
    sessionStorage:{getItem:()=>null,removeItem(){}},window:{addEventListener(){}},
    setInterval:()=>0,setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},
    clearTimeout:id=>timers.delete(id),performance:{now:()=>0},
    fetch:async url=>{
      if(url==='/api/status')return {ok:true,status:200,json:async()=>({connected:true,display:{fps:20,jpegFps:20}})};
      assert.ok(url.startsWith('/api/frame?after='));
      frameRequests++;
      if(frameRequests>1)return new Promise(()=>{});
      return {ok:true,status:200,headers:{get:()=> '1'},blob:()=>body.promise};
    },
    createImageBitmap:decode,
    presentJpegFrame:args=>presentJpegFrame({...args,decode}),
    createRtcRenderer,createTouchSender,createNavigationVolume,streamSummary,createJpegMetrics,displayPreset,
    createMedia:options=>{
      onTransport=options.onTransport;
      media={displayed:false,mode:'auto',open(){},close(){},
        audio:{setBuffer(){},volumes:{music:100,navigation:100},stats:()=>({enabled:false,underruns:0})},
        audioPreference:{wanted:false,start(){}}};
      return media;
    },
  });
  return {video,canvas,draws,clears,node,timers,
    transport(mode) {
      media.displayed=mode==='webrtc';
      if(media.displayed)video.srcObject={};
      onTransport(mode);
      if(!media.displayed)video.srcObject=null;
    },
  };
}

test('production app rejects a JPEG decode that spans a JPEG to RTC to JPEG round trip',async()=>{
  const body=deferred(),decoded=deferred(),entered=deferred();
  let closes=0;
  const f=appFixture({body,decode:()=>{entered.resolve();return decoded.promise;}});
  body.resolve({});await entered.promise;
  f.transport('webrtc');f.transport('jpeg');
  assert.deepEqual(f.draws,[f.video]);
  decoded.resolve({width:640,height:480,close(){closes++;}});await flush();
  assert.deepEqual(f.draws,[f.video]);assert.equal(closes,1);
  assert.equal(f.canvas.width,1280);assert.equal(f.canvas.height,720);
});

test('production app ignores a retired JPEG body failure instead of clearing the held replacement picture',async()=>{
  const body=deferred();
  const f=appFixture({body,decode:async()=>{throw new Error('obsolete body must not decode');}});
  await flush();
  f.transport('webrtc');f.transport('jpeg');
  f.node('status').textContent='replacement is current';
  body.reject(new Error('old body failed'));await flush();
  assert.equal(f.clears.length,0);assert.deepEqual(f.draws,[f.video]);
  assert.equal(f.node('status').textContent,'replacement is current');
});
