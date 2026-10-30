import test from 'node:test';
import assert from 'node:assert/strict';
import {createRtcRenderer} from '../src/main/assets/tesla/rtc-renderer.js';

function fixture({frameCallbacks = true, quality = true} = {}) {
  const animation = new Map(), callbacks = new Map(), timers = new Map(), draws = [], dimensions = [], sizes = [], errors = [], classes = new Set();
  let sequence = 0, clock = 0, frames = 1, width = 1024, height = 768, timerCalls = 0, animationRequests = 0;
  const video = {hidden: true, readyState: 2, videoWidth: 1280, videoHeight: 720, currentTime: 0, srcObject: {},
    classList: {toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }},
    play() { throw new Error('renderer must not control playback'); },
    pause() { throw new Error('renderer must not control playback'); },
  };
  if (frameCallbacks) {
    video.requestVideoFrameCallback = callback => { const id = ++sequence; callbacks.set(id, callback); return id; };
    video.cancelVideoFrameCallback = id => callbacks.delete(id);
  }
  if (quality) video.getVideoPlaybackQuality = () => ({totalVideoFrames: frames});
  const context = {drawImage: (...args) => draws.push(args)};
  const canvas = {hidden: false, getContext: () => context,
    get width() { return width; }, set width(value) { dimensions.push(['width', value]); width = value; },
    get height() { return height; }, set height(value) { dimensions.push(['height', value]); height = value; },
  };
  const renderer = createRtcRenderer({video, canvas, now: () => clock,
    onFrame: (w, h) => sizes.push([w, h]), onError: error => errors.push(error),
    requestFrame(callback) { const id = ++sequence; animationRequests++; animation.set(id, callback); return id; },
    cancelFrame: id => animation.delete(id),
    schedule(callback, delay) { const id = ++sequence; timers.set(id, {callback, at: clock + delay}); return id; },
    cancelScheduled: id => timers.delete(id),
  });
  function run(queue, ...args) {
    assert.equal(queue.size, 1);
    const [id, callback] = [...queue][0]; queue.delete(id); callback(...args);
  }
  function advance(at, advanceVideo = true) {
    while (true) {
      const timer = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!timer || timer[1].at > at) break;
      const [id, {callback, at: due}] = timer;
      clock = due; if (advanceVideo) video.currentTime = due / 1000;
      timers.delete(id); timerCalls++; callback();
    }
    clock = at; if (advanceVideo) video.currentTime = at / 1000;
  }
  return {renderer, video, canvas, context, animation, callbacks, timers, draws, dimensions, sizes, errors, classes, advance,
    get timerCalls() { return timerCalls; }, get animationRequests() { return animationRequests; },
    start() { renderer.setMode('canvas'); renderer.setActive(true); },
    frame(at) { clock = at; frames++; video.currentTime = at / 1000; run(callbacks, at, {mediaTime: video.currentTime, presentedFrames: frames}); },
    refresh(at, advanceVideo = true) { advance(at, advanceVideo); run(animation, at); },
  };
}

test('native is the default and schedules no copying or negotiation', () => {
  const f = fixture(), source = f.video.srcObject;
  assert.equal(f.renderer.mode, 'native');
  f.renderer.setActive(true);
  assert.equal(f.renderer.surface, f.video); assert.equal(f.video.hidden, false); assert.equal(f.canvas.hidden, true);
  assert.equal(f.animation.size, 0); assert.equal(f.callbacks.size, 0); assert.equal(f.timers.size, 0); assert.equal(f.draws.length, 0);
  assert.equal(f.video.srcObject, source);
  f.renderer.stop();
  assert.equal(f.video.hidden, true); assert.equal(f.canvas.hidden, false); assert.equal(f.renderer.surface, f.canvas);
  assert.deepEqual(f.dimensions, []); // JPEG retains its own canvas allocation.
});

test('Canvas keeps native playback visible until its first decoded frame', () => {
  const f = fixture(); f.video.readyState = 1; f.start();
  assert.equal(f.renderer.surface, f.video); assert.equal(f.canvas.hidden, true); assert.equal(f.draws.length, 0);
  f.video.readyState = 2; f.frame(33);
  assert.equal(f.renderer.surface, f.canvas); assert.equal(f.canvas.hidden, false);
  assert.equal(f.video.hidden, false); assert.equal(f.classes.has('rtcOffscreen'), true);
  assert.deepEqual(f.draws[0], [f.video, 0, 0, 1280, 720]);
});

test('decoded dimensions and aspect ratio are retained without same-size canvas resets', () => {
  const f = fixture(); f.start();
  assert.deepEqual(f.dimensions, [['width', 1280], ['height', 720]]);
  f.advance(16); assert.equal(f.draws.length, 1); // Healthy video callbacks own the drawing.
  assert.equal(f.animation.size, 0); assert.equal(f.timers.size, 1);
  f.frame(33); f.frame(66);
  assert.equal(f.dimensions.length, 2); assert.equal(f.draws.length, 3);
  f.video.videoWidth = 1920; f.frame(99);
  assert.deepEqual(f.dimensions.at(-1), ['width', 1920]); assert.equal(f.dimensions.length, 3);
  assert.deepEqual(f.sizes, [[1280, 720], [1920, 720]]);
});

test('older browsers use animation callbacks and avoid copying the same media time', () => {
  const f = fixture({frameCallbacks: false, quality: false}); f.start();
  f.refresh(16, false); assert.equal(f.draws.length, 1);
  f.refresh(33); assert.equal(f.draws.length, 2);
  f.video.videoWidth = 720; f.video.videoHeight = 1280; f.refresh(34, false);
  assert.deepEqual(f.sizes.at(-1), [720, 1280]);
});

test('animation fallback recovers stalled compositor callbacks and a frozen frame counter', () => {
  const f = fixture(); f.start();
  f.advance(249); assert.equal(f.draws.length, 1); assert.equal(f.animation.size, 0);
  f.advance(250); f.refresh(266); assert.equal(f.draws.length, 3);
  f.refresh(280, false); assert.equal(f.draws.length, 3);
  const lateAnimation = [...f.animation.values()][0];
  f.frame(300); f.advance(316); lateAnimation(316); assert.equal(f.draws.length, 4);
  assert.equal(f.animation.size, 0); assert.equal(f.timers.size, 1);
  f.advance(550); assert.equal(f.draws.length, 5); assert.equal(f.animation.size, 1);
});

test('switching modes is local and late callbacks cannot replace native or a new session', () => {
  const f = fixture(), source = f.video.srcObject; f.start();
  const oldVideo = [...f.callbacks.values()][0], oldTimer = [...f.timers.values()][0].callback;
  f.renderer.setMode('native');
  assert.equal(f.classes.has('rtcOffscreen'), false); assert.equal(f.renderer.surface, f.video);
  assert.equal(f.callbacks.size, 0); assert.equal(f.animation.size, 0); assert.equal(f.timers.size, 0); assert.equal(f.video.srcObject, source);
  f.renderer.setMode('canvas'); const count = f.draws.length;
  oldVideo(100, {mediaTime: .1}); oldTimer();
  assert.equal(f.draws.length, count); assert.equal(f.callbacks.size, 1); assert.equal(f.animation.size, 0); assert.equal(f.timers.size, 1);
  f.renderer.stop(); assert.equal(f.callbacks.size, 0); assert.equal(f.animation.size, 0); assert.equal(f.timers.size, 0);
  assert.equal(f.canvas.hidden, false); assert.equal(f.video.hidden, true);
  f.video.srcObject = {}; f.renderer.setActive(true);
  assert.equal(f.draws.length, count + 1);
});

test('source identity fences old stream callbacks even before the transport callback arrives', () => {
  const f = fixture(); f.start(); const count = f.draws.length;
  f.video.srcObject = {};
  f.frame(33); f.advance(250);
  assert.equal(f.draws.length, count); assert.equal(f.callbacks.size, 0); assert.equal(f.animation.size, 0); assert.equal(f.timers.size, 0);
  f.renderer.setActive(true);
  assert.equal(f.draws.length, count + 1); assert.equal(f.callbacks.size, 1); assert.equal(f.animation.size, 0); assert.equal(f.timers.size, 1);
});

test('Canvas context or draw failures restore native presentation and report once', () => {
  const unavailable = fixture(); unavailable.canvas.getContext = () => null; unavailable.start();
  assert.equal(unavailable.errors.length, 1); assert.equal(unavailable.renderer.mode, 'native');
  assert.equal(unavailable.renderer.surface, unavailable.video); assert.equal(unavailable.video.hidden, false);
  assert.equal(unavailable.animation.size, 0); assert.equal(unavailable.callbacks.size, 0); assert.equal(unavailable.timers.size, 0);
  const f = fixture(); f.start();
  const lateTimer = [...f.timers.values()][0].callback;
  f.context.drawImage = () => { throw new Error('video surface unavailable'); }; f.frame(33);
  lateTimer();
  assert.equal(f.errors.length, 1); assert.equal(f.renderer.mode, 'native'); assert.equal(f.video.hidden, false);
  assert.equal(f.canvas.hidden, true); assert.equal(f.classes.has('rtcOffscreen'), false);
  assert.equal(f.animation.size, 0); assert.equal(f.callbacks.size, 0); assert.equal(f.timers.size, 0);
});

test('a refused video callback API falls back to animation drawing', () => {
  const f = fixture({quality: false});
  f.video.requestVideoFrameCallback = () => { throw new Error('not implemented'); };
  f.start(); f.refresh(33);
  assert.equal(f.errors.length, 0); assert.equal(f.draws.length, 2); assert.equal(f.renderer.mode, 'canvas');
});

test('dispose cancels frame callbacks and watchdogs and prevents all later activation', () => {
  const f = fixture(); f.start(); const count = f.draws.length;
  const lateVideo = [...f.callbacks.values()][0], lateTimer = [...f.timers.values()][0].callback;
  f.renderer.dispose(); f.renderer.setActive(true); f.renderer.setMode('canvas');
  lateVideo(100, {mediaTime: .1}); lateTimer();
  assert.equal(f.draws.length, count); assert.equal(f.video.hidden, true); assert.equal(f.canvas.hidden, false);
  assert.equal(f.callbacks.size, 0); assert.equal(f.animation.size, 0); assert.equal(f.timers.size, 0); assert.equal(f.classes.has('rtcOffscreen'), false);
});

test('healthy 50 fps playback has no animation loop and only four watchdog wakeups per second', () => {
  const f = fixture(); f.start();
  for (let at = 20; at <= 10000; at += 20) { f.advance(at); f.frame(at); }
  assert.equal(f.draws.length, 501);
  assert.equal(f.animationRequests, 0);
  assert.ok(f.timerCalls >= 39 && f.timerCalls <= 42, `watchdog ran ${f.timerCalls} times in 10 s`);
  assert.equal(f.timers.size, 1); assert.equal(f.callbacks.size, 1);
  f.renderer.dispose(); assert.equal(f.timers.size, 0);
});

test('a callback API that stops accepting requests switches to one animation loop', () => {
  const f = fixture({quality: false}); f.start();
  const lateTimer = [...f.timers.values()][0].callback;
  f.video.requestVideoFrameCallback = () => { throw new Error('callback API failed'); };
  f.frame(33); assert.equal(f.timers.size, 0); assert.equal(f.animation.size, 1);
  lateTimer(); assert.equal(f.animation.size, 1);
  f.refresh(66); assert.equal(f.draws.length, 3); assert.equal(f.animation.size, 1);
  f.renderer.dispose(); assert.equal(f.animation.size, 0);
});
