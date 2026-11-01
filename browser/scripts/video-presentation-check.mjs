import assert from 'node:assert/strict';

export function installPresentationProbe() {
  const prototype=HTMLVideoElement.prototype;
  const request=prototype.requestVideoFrameCallback,cancel=prototype.cancelVideoFrameCallback;
  if(typeof request!=='function' || typeof cancel!=='function')throw new Error('Real-browser check requires video frame callbacks');
  const probe=window.__videoPresentationProbe={enabled:true,hold:false,held:[],pending:new Set(),
    requests:0,callbacks:0,maxOutstanding:0,lastRequestAt:null,lastPresentedFrames:null,minimumGapMs:null,
    callbackWorkMs:0,hiddenRowAdditions:0};
  addEventListener('DOMContentLoaded',()=>{
    new MutationObserver(records=>{
      if(document.getElementById('diagnostics').open && !document.getElementById('menuPanel').hidden)return;
      for(const record of records)for(const node of record.addedNodes)if(node.dataset?.videoMetric)probe.hiddenRowAdditions++;
    }).observe(document.getElementById('diagnosticValues'),{childList:true});
  });
  prototype.requestVideoFrameCallback=function(callback) {
    if(!probe.enabled)return request.call(this,callback);
    const at=performance.now();
    if(probe.lastRequestAt!==null)probe.minimumGapMs=Math.min(probe.minimumGapMs??Infinity,at-probe.lastRequestAt);
    probe.lastRequestAt=at;probe.requests++;
    const id=request.call(this,(time,metadata)=>{
      probe.pending.delete(id);
      const deliver=()=>{
        probe.callbacks++;probe.lastPresentedFrames=metadata.presentedFrames;const start=performance.now();
        try {callback(time,metadata);} finally {probe.callbackWorkMs+=performance.now()-start;}
      };
      if(probe.hold)probe.held.push(deliver);else deliver();
    });
    probe.pending.add(id);probe.maxOutstanding=Math.max(probe.maxOutstanding,probe.pending.size+probe.held.length);
    return id;
  };
  prototype.cancelVideoFrameCallback=function(id) {probe.pending.delete(id);return cancel.call(this,id);};
}

export async function verifyVideoPresentation(page,scenario,capture) {
  const values=()=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('[data-video-metric]')]
    .map(node=>[node.dataset.videoMetric,node.textContent])));
  const open=async()=>{
    if(await page.locator('#menuPanel').isHidden())await page.locator('#menuButton').click();
    if(!await page.locator('#diagnostics').evaluate(node=>node.open))await page.locator('#diagnostics > summary').click();
    await page.waitForFunction(()=>Number.parseFloat(document.querySelector('[data-video-metric="presentedFps"]')?.textContent)>10);
  };
  await page.waitForFunction(()=>window.__videoPresentationProbe.callbacks>=2);
  assert.equal(await page.locator('[data-video-metric]').count(),0,'closed diagnostics must not build the new metric rows');
  await open();
  const healthy=await values(),yes=scenario.lang==='ar'?'نعم':scenario.lang.startsWith('zh')?'是':'Yes';
  const no=scenario.lang==='ar'?'لا':scenario.lang.startsWith('zh')?'否':'No';
  assert.ok(Number.parseFloat(healthy.presentedFps)>10 && Number.parseFloat(healthy.presentedFps)<45,JSON.stringify(healthy));
  assert.ok(Number(healthy.presentedFrames)>30);assert.ok(Number(healthy.decodedFrames)>30);
  assert.equal(healthy.callbackSupported,yes);assert.equal(healthy.videoPaused,no);
  assert.equal(healthy.videoStreamActive,yes);assert.ok(Number(healthy.videoReady)>=2);
  assert.ok(!Object.values(healthy).some(value=>/undefined|NaN/.test(value)));
  if(scenario.lang==='en')assert.match(await page.locator('#diagnosticValues dt').nth(1).textContent(),/Decoded/);
  const layout=await page.locator('#menuPanel').evaluate(node=>({width:node.clientWidth,scrollWidth:node.scrollWidth}));
  assert.ok(layout.scrollWidth<=layout.width+1,'diagnostic rows must not overflow a narrow/RTL panel');
  await page.locator('[data-video-metric="presentedFps"]').evaluate(node=>node.scrollIntoView({block:'nearest'}));
  await capture(page,`native-video-diagnostics-${scenario.name}-font130.jpg`);

  await page.locator('#diagnostics > summary').click();
  const foldedAt=await page.evaluate(()=>window.__videoPresentationProbe.callbacks);
  await page.waitForFunction(before=>window.__videoPresentationProbe.callbacks>=before+2 &&
    window.__videoPresentationProbe.hiddenRowAdditions===0,foldedAt);
  await page.keyboard.press('Escape');await page.locator('#menuPanel').waitFor({state:'hidden'});
  const closedAt=await page.evaluate(()=>window.__videoPresentationProbe.callbacks);
  await page.waitForFunction(before=>window.__videoPresentationProbe.callbacks>=before+2,closedAt);
  await open();const revealed=await values();
  assert.ok(Number(revealed.presentedFrames)>Number(healthy.presentedFrames),'hidden sampling must continue');

  const hellos=await page.evaluate(()=>window.__uiFixture.hellos.length);
  await page.evaluate(()=>document.getElementById('video').pause());
  await page.waitForFunction(expected=>document.querySelector('[data-video-metric="videoPaused"]')?.textContent===expected,yes);
  await page.waitForTimeout(1500);
  const paused=await values();
  assert.equal(paused.videoPaused,yes);assert.ok(!Number.isFinite(Number.parseFloat(paused.presentedFps)));
  assert.equal(await page.evaluate(()=>document.getElementById('video').paused),true,'diagnostics must not restart playback');
  assert.equal(await page.evaluate(()=>window.__videoPresentationProbe.pending.size),0);
  await page.locator('[data-video-metric="videoPaused"]').evaluate(node=>node.scrollIntoView({block:'nearest'}));
  await capture(page,`native-video-state-${scenario.name}-font130.jpg`);
  await page.evaluate(()=>document.getElementById('video').play());
  await page.waitForFunction(expected=>document.querySelector('[data-video-metric="videoPaused"]')?.textContent===expected &&
    Number.parseFloat(document.querySelector('[data-video-metric="presentedFps"]')?.textContent)>10,no);

  // Withhold only delivery of the sampled callback. The real WebRTC decoder/video keep running.
  const beforeStall=await values();
  const frozenCount=await page.evaluate(()=>{const probe=window.__videoPresentationProbe;probe.hold=true;return probe.lastPresentedFrames;});
  await page.waitForFunction(()=>Number.parseFloat(document.querySelector('[data-video-metric="callbackPending"]')?.textContent)>=3000);
  const stalled=await values();
  assert.ok(!Number.isFinite(Number.parseFloat(stalled.presentedFps)),'stale presentation FPS must become unknown');
  assert.ok(Number(stalled.decodedFrames)>Number(beforeStall.decodedFrames),'decode progress must remain independently visible');
  assert.ok(Number.parseFloat(stalled.callbackAge)>=3000);assert.ok(Number.parseFloat(stalled.submittedFrameAge)>=3000);
  assert.equal(stalled.videoPaused,no);assert.equal(Number(stalled.presentedFrames),frozenCount);
  const stalledRequests=await page.evaluate(()=>window.__videoPresentationProbe.requests);
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>window.__videoPresentationProbe.requests),stalledRequests,'stalls must not accumulate callbacks');
  assert.equal(await page.evaluate(()=>window.__uiFixture.hellos.length),hellos,'sampling must not reconnect media');
  await page.locator('[data-video-metric="callbackPending"]').evaluate(node=>node.scrollIntoView({block:'nearest'}));
  await capture(page,`native-video-callback-stall-${scenario.name}-font130.jpg`);
  await page.evaluate(()=>{const probe=window.__videoPresentationProbe;probe.hold=false;probe.held.splice(0).forEach(deliver=>deliver());});
  await page.waitForFunction(before=>Number(document.querySelector('[data-video-metric="presentedFrames"]')?.textContent)>before &&
    Number.parseFloat(document.querySelector('[data-video-metric="presentedFps"]')?.textContent)>10,Number(beforeStall.presentedFrames));
  const probe=await page.evaluate(()=>{const p=window.__videoPresentationProbe;p.enabled=false;
    return {requests:p.requests,callbacks:p.callbacks,maxOutstanding:p.maxOutstanding,minimumGapMs:p.minimumGapMs,
      callbackWorkMs:p.callbackWorkMs,hiddenRowAdditions:p.hiddenRowAdditions};});
  assert.equal(probe.maxOutstanding,1);assert.ok(probe.minimumGapMs>=990,JSON.stringify(probe));
  assert.equal(probe.hiddenRowAdditions,0);
  await page.keyboard.press('Escape');await page.locator('#menuPanel').waitFor({state:'hidden'});
  return {healthy,paused,injectedCallbackStall:stalled,probe,layout,
    hiddenSampling:true,newRowsOnlyWhenVisible:true,noAutomaticRecovery:true,
    scope:'Real native WebRTC video; callback delivery stall is injected, not a reproduced physical-screen freeze'};
}
