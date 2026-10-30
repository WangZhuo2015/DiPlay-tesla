import test from 'node:test';
import assert from 'node:assert/strict';
import {presentJpegFrame} from '../src/main/assets/tesla/media.js';

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
