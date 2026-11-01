import test from 'node:test';
import assert from 'node:assert/strict';
import {createVideoPresentation} from '../src/main/assets/tesla/video-presentation.js';

function fixture({supported=true}={}) {
  let at=0,visible=true,requests=0;
  const callbacks=new Map(),video={srcObject:{active:true},hidden:false,paused:false,readyState:4,currentTime:0,
    play(){throw new Error('diagnostics must not restart playback');},
    pause(){throw new Error('diagnostics must not stop playback');},
    getVideoPlaybackQuality(){throw new Error('decoded counts are not presentation proof');}};
  if(supported) {
    video.requestVideoFrameCallback=callback=>{const id=++requests;callbacks.set(id,callback);return id;};
    video.cancelVideoFrameCallback=id=>callbacks.delete(id);
  }
  const monitor=createVideoPresentation({video,now:()=>at,isVisible:()=>visible});
  return {monitor,video,callbacks,
    sample(time,active=true){at=time;return monitor.sample(active);},
    frame(time,metadata){at=time;assert.equal(callbacks.size,1);const [id,callback]=[...callbacks][0];callbacks.delete(id);callback(time,metadata);},
    hide(){visible=false;},show(){visible=true;},get requests(){return requests;}};
}

test('low-frequency samples use compositor frame deltas, never callback frequency or a per-frame loop',()=>{
  const f=fixture();f.sample(0);
  for(let at=1;at<1000;at++)f.sample(at);
  assert.equal(f.requests,1);assert.equal(f.callbacks.size,1);
  f.frame(20,{presentedFrames:10,presentationTime:10,mediaTime:.1});
  assert.equal(f.callbacks.size,0,'a completed callback must not schedule another callback');
  assert.equal(f.sample(500).presentedFps,null);
  f.sample(1000);f.frame(1020,{presentedFrames:40,presentationTime:1010,mediaTime:1.1});
  const snapshot=f.sample(1050);
  assert.equal(snapshot.presentedFps,30);assert.equal(snapshot.presentedFrames,40);
  assert.equal(snapshot.callbackAgeMs,30);assert.equal(snapshot.frameMediaTime,1.1);
  assert.equal(f.requests,2);assert.equal(f.callbacks.size,0);
});

test('a stalled callback stays bounded and cannot leave a stale healthy FPS on diagnostics',()=>{
  const f=fixture();
  f.sample(0);f.frame(20,{presentedFrames:10,presentationTime:10});
  f.sample(1000);f.frame(1020,{presentedFrames:40,presentationTime:1010});
  f.sample(2000);
  f.video.currentTime=30;
  const stalled=f.sample(30000);
  assert.equal(stalled.presentedFps,null);assert.equal(stalled.presentedFrames,40);
  assert.equal(stalled.callbackPendingMs,28000);assert.equal(stalled.callbackAgeMs,28980);
  assert.equal(stalled.currentTime,30);assert.equal(stalled.paused,false);
  assert.equal(f.requests,3);assert.equal(f.callbacks.size,1);
});

test('paused, hidden and ended streams retain observations but cancel pending work and reset rate baselines',()=>{
  const f=fixture();f.sample(0);f.frame(20,{presentedFrames:10,presentationTime:10});
  f.sample(1000);f.hide();
  const hidden=f.sample(1100);
  assert.equal(hidden.presentedFrames,10);assert.equal(hidden.callbackAgeMs,1080);
  assert.equal(hidden.pageVisible,false);assert.equal(f.callbacks.size,0);
  f.show();f.sample(1200);assert.equal(f.callbacks.size,0,'visibility changes must not bypass the one-second throttle');
  f.sample(2000);f.frame(2020,{presentedFrames:15,presentationTime:2010});
  assert.equal(f.sample(2050).presentedFps,null,'hidden time must not be averaged into a new rate');
  f.video.paused=true;assert.equal(f.sample(2100).paused,true);assert.equal(f.callbacks.size,0);
  f.video.paused=false;f.video.hidden=true;assert.equal(f.sample(2200).elementHidden,true);
  f.video.hidden=false;f.video.srcObject.active=false;
  assert.equal(f.sample(2300).streamActive,false);assert.equal(f.callbacks.size,0);
  assert.equal(f.sample(3000).presentedFrames,15);
});

test('retired stream callbacks cannot contaminate a replacement stream or disposed monitor',()=>{
  const f=fixture();f.sample(0);const late=[...f.callbacks.values()][0];
  f.video.srcObject={active:true};f.sample(100);
  late(50,{presentedFrames:900,presentationTime:50});
  assert.equal(f.callbacks.size,1);assert.equal(f.sample(110).presentedFrames,null);
  f.frame(120,{presentedFrames:1,presentationTime:120});
  assert.equal(f.sample(130).presentedFrames,1);
  f.sample(1100);const afterDispose=[...f.callbacks.values()][0];
  f.monitor.dispose();afterDispose(1150,{presentedFrames:999,presentationTime:1150});
  assert.equal(f.sample(1200).presentedFrames,null);assert.equal(f.callbacks.size,0);
});

test('unsupported callbacks and missing/regressing metadata remain unknown instead of inventing FPS',()=>{
  const unsupported=fixture({supported:false});
  assert.equal(unsupported.sample(0).supported,false);assert.equal(unsupported.sample(5000).presentedFps,null);
  const f=fixture();f.sample(0);f.frame(20);
  assert.equal(f.sample(1000).presentedFrames,null);
  f.frame(1020,{presentedFrames:30,presentationTime:1010});
  assert.equal(f.sample(2000).presentedFps,null);
  f.frame(2020,{presentedFrames:1,presentationTime:2010});
  assert.equal(f.sample(2100).presentedFps,null);
});

test('callback registration failure is visible and does not retry endlessly or change playback',()=>{
  const f=fixture();
  let attempts=0;
  f.video.requestVideoFrameCallback=()=>{attempts++;throw new Error('Callback API unavailable');};
  const failed=f.sample(0);
  assert.equal(failed.supported,false);assert.equal(failed.error,'frame-callback-request-failed');
  assert.equal(f.sample(5000).callbackPendingMs,null);assert.equal(f.video.paused,false);
  assert.equal(attempts,1);
});

test('late callback delivery does not make old compositor submissions look fresh',()=>{
  const f=fixture();f.sample(0);f.frame(20,{presentedFrames:10,presentationTime:10});
  f.sample(1000);f.frame(5000,{presentedFrames:40,presentationTime:1010});
  const delayed=f.sample(5010);
  assert.equal(delayed.presentedFps,null);
  assert.equal(delayed.callbackAgeMs,10);assert.equal(delayed.submittedFrameAgeMs,4000);
});
