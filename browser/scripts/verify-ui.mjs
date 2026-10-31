/**
 * Browser integration check with production assets and a synthetic WebRTC loopback peer.
 * Run: npm install --no-save playwright && npx playwright install chromium
 *      node browser/scripts/verify-ui.mjs
 * Optional: DIPLAY_PLAYWRIGHT_MODULE, DIPLAY_CHROMIUM_PATH, DIPLAY_UI_OUTPUT,
 * DIPLAY_UI_CJK_FONT (path to NotoSansCJKsc-Regular.otf when system CJK fonts are absent).
 * No Android, CarPlay, network throughput or end-to-end latency claim is made here.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname} from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const assets = resolve(root, 'browser/src/main/assets/tesla');
const output = resolve(process.env.DIPLAY_UI_OUTPUT || resolve(root, 'docs/testing/tesla'));
const imported = process.env.DIPLAY_PLAYWRIGHT_MODULE;
const playwright = await import(imported ? pathToFileURL(imported).href : 'playwright');
const {chromium} = playwright.chromium ? playwright : playwright.default;
const cjkFont=process.env.DIPLAY_UI_CJK_FONT ? await readFile(process.env.DIPLAY_UI_CJK_FONT) : null;
await mkdir(output, {recursive:true});
const initialDisplay = () => ({mode:'RIGHT',right:{width:1024,height:768},full:{width:1920,height:1080},fps:20,jpegFps:20,jpegQuality:75});
let display = initialDisplay(), activeDisplay = initialDisplay(), touches = [], saves = [], actions = [], lateFrames = 0;
const pixel = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==', 'base64');
const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const json = value => {res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(value));};
    const body = async () => {let value=''; for await(const chunk of req) value+=chunk; return JSON.parse(value);};
    if(url.pathname==='/__fixture-cjk.otf' && cjkFont) {res.writeHead(200,{'Content-Type':'font/otf'});res.end(cjkFont);return;}
    if(url.pathname.startsWith('/api/') && req.headers.authorization !== 'Bearer '+ '0'.repeat(32)) {
      res.writeHead(401); res.end(); return;
    }
    if(url.pathname==='/api/status') return json({connected:true,stage:'Synthetic browser verification',display,activeDisplay,
      pendingReconnect:JSON.stringify(display)!==JSON.stringify(activeDisplay)});
    if(url.pathname==='/api/display') {
      display=await body(); display.jpegFps=Math.min(display.fps,30); saves.push(display); return json(display);
    }
    if(url.pathname==='/api/touch') {touches.push(await body()); return json({ok:true});}
    if(url.pathname==='/api/action') {actions.push(await body()); return json({ok:true});}
    if(url.pathname==='/api/frame') {
      // Deliberately finish a JPEG request after real WebRTC has taken the canvas.
      setTimeout(()=>{lateFrames++; res.writeHead(200,{'Content-Type':'image/jpeg','X-Frame-Sequence':'1'});res.end(pixel);},2500);
      return;
    }
    const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(!/^[a-z0-9.-]+$/.test(name)) {res.writeHead(404);res.end();return;}
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.txt':'text/plain'}[extname(name)] || 'application/octet-stream';
    const data=await readFile(resolve(assets,name)); res.writeHead(200,{'Content-Type':mime});res.end(data);
  } catch(error) {res.writeHead(500);res.end(String(error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true,executablePath:process.env.DIPLAY_CHROMIUM_PATH || undefined,
  args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const report={scope:'Production browser assets, synthetic local WebRTC peer and REST responses; no vehicle or Android device',
  browser:browser.version(),fontScale:1.3,cjkFallback:cjkFont?'Noto Sans CJK SC':'System fonts',checks:[],screenshots:[]};

// This is a signaling fixture, not a fake RTCPeerConnection or fake video element.
function installFixture({cjk}) {
  localStorage.setItem('diplay-token','0'.repeat(32));
  localStorage.setItem('diplay-browser-audio','false');
  localStorage.setItem('diplay-video','auto');
  localStorage.setItem('diplay-rtc-renderer','native');
  localStorage.setItem('diplay-rtc-recovery-ms','10000');
  // Do not seed/reset the volume keys: fresh contexts test defaults, reloads test persistence.
  addEventListener('DOMContentLoaded',()=>{
    document.body.style.fontSize='20.8px';
    if(cjk) {
      const style=document.createElement('style');
      style.textContent='@font-face{font-family:"Fixture CJK";src:url("/__fixture-cjk.otf")}body{font-family:system-ui,"Fixture CJK",sans-serif}';
      document.head.append(style);
    }
  });
  const fixture=window.__uiFixture={hellos:[],answers:0,ready:0,codec:null,encoded:0,errors:[]};
  const Peer=window.RTCPeerConnection;
  let sequence=0;
  class LocalMediaSocket {
    static OPEN=1;
    static CLOSED=3;
    constructor() {this.readyState=0;this.closed=false;queueMicrotask(()=>{this.readyState=1;this.onopen?.({});});}
    deliver(data) {if(!this.closed)this.onmessage?.({data:JSON.stringify(data)});}
    send(raw) {
      const data=JSON.parse(raw);
      if(data.type==='hello') {
        fixture.hellos.push(data);this.deliver({type:'welcome'});
        if(data.rtc)this.start(data.recoveryGraceMs).catch(error=>fixture.errors.push(String(error)));
      } else if(data.type==='rtc-answer') {
        fixture.answers++;this.peer?.setRemoteDescription({type:'answer',sdp:data.sdp}).catch(error=>fixture.errors.push(String(error)));
      } else if(data.type==='rtc-ready')fixture.ready++;
      else if(data.type==='ping')this.deliver({type:'pong'});
      else if(data.type==='rtc-fallback')this.deliver({type:'rtc-stop',id:this.id,reason:'browser-fallback'});
    }
    async start(grace) {
      this.id=++sequence;
      const source=document.createElement('canvas');source.width=960;source.height=540;
      const ctx=source.getContext('2d');let frame=0;
      const paint=()=>{
        frame++;ctx.fillStyle='#102435';ctx.fillRect(0,0,960,540);
        ctx.strokeStyle='#28516b';ctx.lineWidth=2;
        for(let x=0;x<960;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,540);ctx.stroke();}
        for(let y=0;y<540;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(960,y);ctx.stroke();}
        ctx.fillStyle='#d3efff';ctx.font='bold 32px sans-serif';ctx.fillText('Synthetic WebRTC rendering test',48,74);
        ctx.font='22px sans-serif';ctx.fillText('Browser loopback · no CarPlay device',48,113);
        ctx.fillStyle='#59c8bc';ctx.fillRect(48+(frame*3)%800,440,42,42);
        ctx.strokeStyle='#d3efff';ctx.lineWidth=4;ctx.beginPath();ctx.arc(480,270,35,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.moveTo(460,270);ctx.lineTo(500,270);ctx.moveTo(480,250);ctx.lineTo(480,290);ctx.stroke();
      };
      paint();this.paintTimer=setInterval(paint,1000/30);
      this.stream=source.captureStream(30);
      const peer=this.peer=new Peer({iceServers:[]});
      const transceiver=peer.addTransceiver(this.stream.getVideoTracks()[0],{direction:'sendonly',streams:[this.stream]});
      const available=RTCRtpSender.getCapabilities('video').codecs;
      // Some Chromium distributions omit H.264 encoding; this check exercises presentation,
      // not Android's H.264 sender. Record the real negotiated codec in the report.
      const preferred=available.some(codec=>codec.mimeType.toLowerCase()==='video/h264')?'video/h264':'video/vp8';
      const codecs=available.filter(codec=>codec.mimeType.toLowerCase()===preferred);
      if(!codecs.length)throw new Error('No supported synthetic video encoder');
      transceiver.setCodecPreferences(codecs);
      await peer.setLocalDescription(await peer.createOffer());
      if(peer.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{peer.removeEventListener('icegatheringstatechange',changed);reject(new Error('Fixture ICE gathering timed out'));},4000);
        const changed=()=>{if(peer.iceGatheringState==='complete'){clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',changed);resolve();}};
        peer.addEventListener('icegatheringstatechange',changed);changed();
      });
      if(this.closed)return;
      this.deliver({type:'rtc-offer',id:this.id,sdp:peer.localDescription.sdp,recoveryGraceMs:grace});
      this.progressTimer=setInterval(async()=>{
        if(this.closed)return;
        const stats=await peer.getStats();let encoded=0;
        stats.forEach(row=>{if(row.type==='outbound-rtp' && row.kind==='video'){
          encoded=row.framesEncoded || 0;fixture.encoded=encoded;fixture.codec=stats.get(row.codecId)?.mimeType || null;
        }});
        this.deliver({type:'rtc-progress',id:this.id,sent:encoded,received:encoded,sendFailures:0,recoveryGraceMs:grace,
          recovering:false,queueBudgetMs:50,queueFrames:0,queueBytes:0,expiredFrames:0,overflowFrames:0,keyframeSkips:0,invalidatedFrames:0});
      },500);
    }
    close() {if(this.closed)return;this.closed=true;this.readyState=3;clearInterval(this.paintTimer);clearInterval(this.progressTimer);
      this.stream?.getTracks().forEach(track=>track.stop());this.peer?.close();queueMicrotask(()=>this.onclose?.({}));}
  }
  window.WebSocket=LocalMediaSocket;
}

async function openSettings(page) {
  await page.locator('#menuButton').focus();await page.keyboard.press('Enter');
  await page.locator('#settingsButton').click();
  await page.locator('#displayPanel').waitFor({state:'visible'});
  await page.locator('#manualDisplay > summary').click();
}
async function assertLayout(page) {
  const layout=await page.evaluate(()=>{
    const panel=document.querySelector('#displayForm');
    return {viewport:innerWidth,document:document.documentElement.scrollWidth,panel:panel.clientWidth,scroll:panel.scrollWidth,
      font:parseFloat(getComputedStyle(document.body).fontSize),direction:document.documentElement.dir,
      controls:['renderer','recovery','fps'].map(id=>({id,width:document.getElementById(id).getBoundingClientRect().width}))};
  });
  assert.ok(layout.document<=layout.viewport,JSON.stringify(layout));
  assert.ok(layout.scroll<=layout.panel+1,JSON.stringify(layout));
  assert.equal(layout.font,20.8);assert.ok(layout.controls.every(control=>control.width>0));
  return layout;
}
async function capture(page,name) {
  await page.screenshot({path:resolve(output,name),type:'jpeg',quality:85});report.screenshots.push(name);
}
async function openVolumeMenu(page) {
  await page.locator('#menuButton').focus();await page.keyboard.press('Enter');
  await page.locator('#menuPanel').waitFor({state:'visible'});
  assert.equal(await page.locator('#menuButton').getAttribute('aria-expanded'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'closeMenu');
}
async function assertVolumeLayout(page,lang) {
  const layout=await page.evaluate(()=>{
    const panel=document.querySelector('#menuPanel .panel'),box=panel.getBoundingClientRect();
    const controls=[...panel.querySelectorAll('.audioVolume label,.audioVolume output,.audioVolume input')].map(node=>{
      const rect=node.getBoundingClientRect();
      return {id:node.id || node.htmlFor,left:rect.left,right:rect.right,width:rect.width};
    });
    return {viewport:innerWidth,document:document.documentElement.scrollWidth,panel:panel.clientWidth,
      scroll:panel.scrollWidth,left:box.left,right:box.right,font:parseFloat(getComputedStyle(document.body).fontSize),
      direction:document.documentElement.dir,deviceScaleFactor:devicePixelRatio,controls};
  });
  assert.ok(layout.document<=layout.viewport,JSON.stringify(layout));
  assert.ok(layout.scroll<=layout.panel+1,JSON.stringify(layout));
  assert.ok(layout.left>=0 && layout.right<=layout.viewport,JSON.stringify(layout));
  assert.ok(layout.controls.every(control=>control.width>0 && control.left>=layout.left && control.right<=layout.right),JSON.stringify(layout));
  assert.equal(layout.font,20.8);assert.equal(layout.direction,lang==='ar'?'rtl':'ltr');
  return layout;
}
async function verifyVolumes(page,scenario) {
  const baseline={hellos:await page.evaluate(()=>window.__uiFixture.hellos.length),actions:actions.length};
  const expected={music:100,navigation:100},stored={music:null,navigation:null},steps=[];
  async function checkState(stage) {
    const state=await page.evaluate(()=>Object.fromEntries(['music','navigation'].map(role=>{
      const slider=document.getElementById(role+'Volume'),output=document.getElementById(role+'VolumeValue');
      return [role,{value:slider.value,output:output.value,text:output.textContent,
        aria:slider.getAttribute('aria-valuetext'),stored:localStorage.getItem('diplay-'+role+'-volume')}];
    })));
    for(const role of ['music','navigation'])assert.deepEqual(state[role],{
      value:String(expected[role]),output:expected[role]+'%',text:expected[role]+'%',
      aria:expected[role]+'%',stored:stored[role]
    },stage+': '+role);
    assert.equal(await page.evaluate(()=>window.__uiFixture.hellos.length),baseline.hellos,stage+': volume must not restart media');
    assert.equal(actions.length,baseline.actions,stage+': volume must not send a CarPlay action');
    steps.push({stage,...state});
  }
  await openVolumeMenu(page);
  await checkState('fresh defaults');
  const layout=await assertVolumeLayout(page,scenario.lang);
  assert.equal(layout.deviceScaleFactor,scenario.deviceScaleFactor || 1);
  // Reach both sliders through the real menu tab order, not just programmatic focus.
  for(let index=0;index<20 && await page.evaluate(()=>document.activeElement.id)!=='musicVolume';index++)await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'musicVolume');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'navigationVolume');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'musicVolume');
  for(const role of ['music','navigation']) {
    const slider=page.locator('#'+role+'Volume');
    const attributes=await slider.evaluate(node=>({type:node.type,min:node.min,max:node.max,step:node.step,
      disabled:node.disabled,tabIndex:node.tabIndex,label:node.labels?.[0]?.textContent.trim(),
      output:document.getElementById(node.id+'Value').getAttribute('for')}));
    assert.deepEqual({type:attributes.type,min:attributes.min,max:attributes.max,step:attributes.step},
      {type:'range',min:'0',max:'100',step:'1'});
    assert.ok(!attributes.disabled && attributes.tabIndex>=0 && attributes.label,role+': accessible slider');
    assert.equal(attributes.output,role+'Volume');
    await slider.scrollIntoViewIfNeeded();
    assert.equal(await slider.evaluate(node=>{
      const box=node.getBoundingClientRect(),panel=node.closest('.panel').getBoundingClientRect();
      return box.top>=panel.top && box.bottom<=panel.bottom &&
        document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)===node;
    }),true,role+': visible and unobstructed inside menu panel');
    await slider.click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),role+'Volume');
    // Keep focus on the slider: each assertion observes live input, before change/blur.
    const keys=[['Home',0],['ArrowRight',1],['End',100],['ArrowRight',100],
      ['Home',0],['ArrowLeft',0],['End',100],...(role==='music'?[['ArrowLeft',99]]:[['Home',0],['ArrowRight',1]])];
    for(const [key,value] of keys) {
      await page.keyboard.press(key);expected[role]=value;stored[role]=String(value);
      assert.equal(await page.evaluate(()=>document.activeElement.id),role+'Volume');
      await checkState(role+' '+key+' → '+value);
    }
  }
  await page.locator('.audioVolumes').scrollIntoViewIfNeeded();
  await capture(page,`browser-volume-menu-${scenario.name}-font130.jpg`);
  await page.keyboard.press('Escape');
  await page.locator('#menuPanel').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.activeElement.id),'menuButton');
  await checkState('menu closed');
  await page.reload();
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>{const video=document.getElementById('video');return !video.hidden && video.videoWidth===960 && window.__uiFixture.codec;});
  // A reload starts one new connection; slider changes must not add another hello.
  assert.equal(await page.evaluate(()=>window.__uiFixture.hellos.length),1);
  assert.equal(actions.length,baseline.actions,'Reload must not send a CarPlay action');
  baseline.hellos=1;
  await openVolumeMenu(page);
  await checkState('persisted after reload');
  const reloadedLayout=await assertVolumeLayout(page,scenario.lang);
  await page.locator('.audioVolumes').scrollIntoViewIfNeeded();
  await capture(page,`browser-volume-menu-${scenario.name}-reloaded-font130.jpg`);
  await page.keyboard.press('Escape');
  await page.locator('#menuPanel').waitFor({state:'hidden'});
  return {layout,reloadedLayout,steps,defaults:true,independentControls:true,liveKeyboardInput:true,
    pointerAccessible:true,tabAccessible:true,persistedAfterReload:true,volumeKeepsMedia:true,noCarPlayActions:true};
}
try {
  const cases=[{name:'full-en',width:1920,height:1080,lang:'en'},
    {name:'compact-zh',width:1024,height:768,lang:'zh-CN',deviceScaleFactor:2},
    {name:'narrow-ar',width:360,height:740,lang:'ar'}];
  for(const scenario of cases) {
    console.log('Checking',scenario.name);
    display=initialDisplay();activeDisplay=initialDisplay();touches=[];saves=[];actions=[];lateFrames=0;
    const context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height},locale:scenario.lang,
      deviceScaleFactor:scenario.deviceScaleFactor || 1});
    await context.addInitScript(installFixture,{cjk:Boolean(cjkFont)});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',error=>{errors.push(String(error));console.error('Browser error:',String(error));});
    await page.goto(`${base}/?lang=${scenario.lang}`);
    await page.evaluate(()=>document.fonts.ready);
    try {
      await page.waitForFunction(()=>{const video=document.getElementById('video');return !video.hidden && video.videoWidth===960 && window.__uiFixture.codec;},{},{timeout:15000});
    } catch(error) {
      console.error(await page.evaluate(()=>({fixture:window.__uiFixture,status:document.getElementById('status').textContent,
        video:{width:document.getElementById('video').videoWidth,hidden:document.getElementById('video').hidden}})));
      throw error;
    }
    assert.equal(await page.locator('#picture').isVisible(),false);
    console.log('Native video received');
    const volumes=await verifyVolumes(page,scenario);
    console.log('Volume controls, menu layout and reload persistence checked');
    await openSettings(page);
    await page.locator('#renderer').selectOption('canvas');
    await page.locator('#recovery').selectOption('4000');
    await page.locator('#fps').fill('60');
    const layout=await assertLayout(page);
    await page.locator('label[for=renderer]').evaluate(node=>{node.scrollIntoView({block:'start'});node.closest('.panel').scrollTop-=16;});
    await capture(page,`wheelplay-settings-${scenario.name}-font130.jpg`);
    console.log('Settings layout captured');
    // The end of the form and its focus trap remain reachable after the added controls.
    await page.locator('#displayForm button[type=submit]').focus();
    if(scenario.lang==='ar')await capture(page,'wheelplay-settings-narrow-ar-actions-font130.jpg');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'mode');
    await page.locator('#displayForm button[type=submit]').click();
    await page.locator('#displayPanel').waitFor({state:'hidden'});
    console.log('Profile saved');
    await page.waitForFunction(()=>document.getElementById('video').classList.contains('rtcOffscreen') &&
      !document.getElementById('picture').hidden && document.getElementById('picture').width===960);
    console.log('Canvas video received');
    assert.equal(saves.at(-1).fps,60);assert.equal(saves.at(-1).jpegFps,30);assert.equal(activeDisplay.fps,20);
    assert.equal(actions.length,0,'Saving a profile must not reconnect CarPlay');
    assert.deepEqual(await page.evaluate(()=>window.__uiFixture.hellos.map(hello=>hello.recoveryGraceMs)),[10000,4000]);
    // The delayed one-pixel JPEG must not resize or paint the active RTC canvas.
    await page.waitForTimeout(2700);
    assert.ok(lateFrames>0);assert.equal(await page.locator('#picture').evaluate(node=>node.width),960);
    await page.mouse.click(scenario.width/2,scenario.height/2);
    await page.waitForTimeout(100);
    const down=touches.flatMap(packet=>packet.contacts).find(contact=>contact.down);
    const up=touches.flatMap(packet=>packet.contacts).find(contact=>contact.down===false);
    assert.ok(down && up,'Canvas touch must send both press and release');
    assert.ok(Math.abs(down.x-.5)<.01 && Math.abs(down.y-.5)<.01,JSON.stringify(down));
    if(scenario.name==='full-en')await capture(page,'wheelplay-canvas-full-en-font130.jpg');
    await openSettings(page);
    await page.locator('#renderer').selectOption('native');
    await page.locator('#displayForm button[type=submit]').click();
    await page.waitForFunction(()=>!document.getElementById('video').hidden && !document.getElementById('video').classList.contains('rtcOffscreen'));
    assert.equal(await page.locator('#picture').isVisible(),false);
    assert.equal(await page.evaluate(()=>window.__uiFixture.hellos.length),2,'Renderer-only save must not restart media');
    assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.__uiFixture.errors),[]);
    report.checks.push({scenario:scenario.name,layout,volumes,codec:await page.evaluate(()=>window.__uiFixture.codec),
      nativeToCanvasToNative:true,canvasTouch:true,lateJpegIgnored:true,frameRateSavedForNextConnection:true,recoveryHello:true,
      rendererOnlyKeepsMedia:true,focusTrap:true});
    await context.close();
  }
  report.result='passed';
  await writeFile(resolve(output,'browser-volume-verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {
  await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
