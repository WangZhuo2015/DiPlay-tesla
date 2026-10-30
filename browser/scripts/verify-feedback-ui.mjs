/** Headless production UI + synthetic HTTP/signaling, no car, microphone or desktop capture.
 * Uses an existing Playwright install: DIPLAY_PLAYWRIGHT_MODULE, optional DIPLAY_CHROMIUM_PATH,
 * DIPLAY_UI_OUTPUT. JPEGs really decode; a deliberately invalid RTC offer tests error reporting.
 * The existing verify-ui.mjs separately exercises a real RTC loopback where UDP is available.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=resolve(process.env.DIPLAY_UI_OUTPUT||resolve(root,'docs/testing/tesla/browser-feedback-20261030'));
const module=await import(process.env.DIPLAY_PLAYWRIGHT_MODULE?pathToFileURL(process.env.DIPLAY_PLAYWRIGHT_MODULE).href:'playwright');
const {chromium}=module.chromium?module:module.default;
const browser=await chromium.launch({headless:true,executablePath:process.env.DIPLAY_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-gpu']});
await mkdir(output,{recursive:true});
const source=await browser.newPage();
const jpeg=Buffer.from(await source.evaluate(()=>{
  const c=document.createElement('canvas');c.width=960;c.height=540;const g=c.getContext('2d');
  g.fillStyle='#102435';g.fillRect(0,0,960,540);g.strokeStyle='#28516b';
  for(let x=0;x<960;x+=60){g.beginPath();g.moveTo(x,0);g.lineTo(x,540);g.stroke();}
  for(let y=0;y<540;y+=60){g.beginPath();g.moveTo(0,y);g.lineTo(960,y);g.stroke();}
  g.fillStyle='#d3efff';g.font='32px sans-serif';g.fillText('Synthetic JPEG · no vehicle',48,75);
  return c.toDataURL('image/jpeg',.8).split(',')[1];
}),'base64');
await source.close();
let level=-10,writes=[],conflictNext=false,failNext=false,moving=true,sequence=0,frameHold=false,denyAuth=false;
const display={mode:'FULL',right:{width:1024,height:768},full:{width:1920,height:1080},fps:60,jpegFps:20,jpegQuality:75};
const server=createServer(async(req,res)=>{
  try {
    const path=new URL(req.url,'http://localhost');
    const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    if(path.pathname==='/api/pair')return json({token:'0'.repeat(32)});
    if(path.pathname.startsWith('/api/') && (denyAuth || req.headers.authorization!=='Bearer '+'0'.repeat(32))){res.writeHead(401);res.end();return;}
    if(path.pathname==='/api/status')return json({connected:true,stage:'Synthetic verification · no vehicle',display,activeDisplay:display,navigationAttenuationDb:level});
    if(path.pathname==='/api/navigation-volume') {
      let body='';for await(const chunk of req)body+=chunk;const value=JSON.parse(body);
      if(conflictNext){level=-15;conflictNext=false;}
      if(value.expectedDb!==level)return json({navigationAttenuationDb:level},409);
      if(failNext){failNext=false;res.writeHead(503);res.end();return;}
      assert.ok(Number.isInteger(value.db) && value.db>=-20 && value.db<=0);
      level=value.db;writes.push(value);await new Promise(resolve=>setTimeout(resolve,180));
      return json({navigationAttenuationDb:level});
    }
    if(path.pathname==='/api/frame') {
      if(frameHold){res.writeHead(204);res.end();return;}
      if(moving)sequence++;
      if(Number(path.searchParams.get('after'))>=sequence){res.writeHead(204);res.end();return;}
      res.writeHead(200,{'Content-Type':'image/jpeg','X-Frame-Sequence':String(sequence)});res.end(jpeg);return;
    }
    if(path.pathname==='/api/touch')return json({ok:true});
    const name=path.pathname==='/'?'index.html':path.pathname.slice(1);
    if(!/^[a-z0-9.-]+$/.test(name)){res.writeHead(404);res.end();return;}
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.txt':'text/plain'}[extname(name)];
    const data=await readFile(resolve(root,'browser/src/main/assets/tesla',name));res.writeHead(200,{'Content-Type':mime});res.end(data);
  }catch(error){res.writeHead(500);res.end(String(error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const report={scope:'Production browser assets; synthetic HTTP and invalid RTC offer; real JPEG decoding. No Android, vehicle or working H.264 transport claim.',browser:browser.version(),fontScale:1.3,checks:[],screenshots:[]};
function fixture() {
  localStorage.setItem('diplay-token','0'.repeat(32));localStorage.setItem('diplay-browser-audio','false');localStorage.setItem('diplay-video','jpeg');
  addEventListener('DOMContentLoaded',()=>{document.body.style.fontSize='20.8px';});
  const state=window.__feedbackFixture={hellos:0,fallbacks:0};
  class Signaling {
    static OPEN=1;
    constructor(){this.readyState=0;state.socket=this;queueMicrotask(()=>{this.readyState=1;this.onopen?.();});}
    send(raw){const data=JSON.parse(raw);
      if(data.type==='hello'){state.hellos++;if(data.rtc)this.onmessage?.({data:JSON.stringify({type:'rtc-offer',id:1,sdp:'synthetic invalid offer'})});}
      if(data.type==='rtc-fallback'){state.fallbacks++;this.onmessage?.({data:JSON.stringify({type:'rtc-stop',id:1,reason:'browser-fallback',retryAfterMs:5000})});}
    }
    close(){this.readyState=3;this.onclose?.();}
  }
  window.WebSocket=Signaling;
}
try {
  for(const scenario of [{name:'full-en',width:1920,height:1080,lang:'en'},{name:'compact-zh',width:1024,height:768,lang:'zh-CN'},{name:'narrow-ar',width:360,height:740,lang:'ar'}]) {
    console.log('Checking',scenario.name);level=-10;writes=[];conflictNext=failNext=false;moving=true;sequence=0;frameHold=true;denyAuth=false;
    const context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height},locale:scenario.lang});
    await context.addInitScript(fixture);const page=await context.newPage();page.setDefaultTimeout(12000);
    const errors=[];page.on('pageerror',error=>errors.push(String(error)));
    await page.goto(`${base}/?lang=${scenario.lang}`);
    await page.locator('#menuButton').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>!document.getElementById('navigationLevel').disabled);
    assert.match(await page.locator('#transportStatus').textContent(),/fps: (Unknown|未知|غير معروف)/);
    assert.doesNotMatch(await page.locator('#transportStatus').textContent(),/1920|1080|60\.0 fps/);
    frameHold=false;
    await page.waitForFunction(()=>document.getElementById('transportStatus').textContent.includes('960 × 540'));
    await page.locator('#navigationDown').click({clickCount:3,delay:20});
    await page.waitForFunction(()=>document.getElementById('navigationValue').textContent==='-13 dB' && document.getElementById('navigationLevel').getAttribute('aria-busy')==='false');
    assert.equal(level,-13);assert.ok(writes.length<3,'Quick gestures should coalesce');
    await page.locator('#navigationLevel').evaluate(node=>{node.value='-6';node.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.waitForFunction(()=>document.getElementById('navigationValue').textContent==='-6 dB' && document.getElementById('navigationLevel').getAttribute('aria-busy')==='false');
    level=-9;await page.waitForFunction(()=>document.getElementById('navigationValue').textContent==='-9 dB');
    conflictNext=true;await page.locator('#navigationUp').click();
    await page.waitForFunction(()=>document.getElementById('navigationValue').textContent==='-15 dB' && document.getElementById('navigationState').dataset.issue==='true');
    failNext=true;await page.locator('#navigationUp').click();
    await page.waitForFunction(()=>document.getElementById('navigationLevel').disabled);
    await page.waitForFunction(()=>!document.getElementById('navigationLevel').disabled && document.getElementById('navigationValue').textContent==='-15 dB');
    await page.locator('#navigationUp').click();
    await page.waitForFunction(()=>document.getElementById('navigationValue').textContent==='-14 dB' && document.getElementById('navigationLevel').getAttribute('aria-busy')==='false');
    assert.equal(await page.evaluate(()=>window.__feedbackFixture.hellos),1,'Volume must preserve the media socket');
    moving=false;await page.waitForFunction(()=>document.getElementById('transportStatus').textContent.includes('0.0 fps'));
    assert.ok((await page.locator('#transportStatus').textContent()).includes('JPEG'));
    const layout=await page.locator('#menuPanel .panel').evaluate(panel=>({width:panel.clientWidth,scroll:panel.scrollWidth,viewport:innerWidth,document:document.documentElement.scrollWidth,
      controls:[...panel.querySelectorAll('.navigationControls button,.navigationControls input')].map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height}))}));
    assert.ok(layout.scroll<=layout.width+1 && layout.document<=layout.viewport,JSON.stringify(layout));
    assert.ok(layout.controls.every(row=>row.width>=48 && row.height>=48),JSON.stringify(layout));
    await page.locator('.navigationVolume').scrollIntoViewIfNeeded();
    const capture=async name=>{await page.screenshot({path:resolve(output,name),type:'jpeg',quality:85});report.screenshots.push(name);};
    await capture(`feedback-menu-${scenario.name}-font130.jpg`);
    await page.reload();
    await page.waitForFunction(()=>document.getElementById('navigationValue').textContent==='-14 dB');
    await page.locator('#menuButton').focus();await page.keyboard.press('Enter');await page.locator('#settingsButton').click();
    await page.locator('#manualDisplay > summary').click();await page.locator('#transport').selectOption('auto');
    // This fixture exposes only the navigation endpoint. Intercept display persistence for this UI-only change.
    await page.route('**/api/display',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(display)}));
    await page.locator('#displayForm button[type=submit]').click();
    await page.locator('#menuButton').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.getElementById('videoExplanation').textContent.includes('negotiation-failed'));
    assert.equal(await page.evaluate(()=>window.__feedbackFixture.fallbacks),1);
    assert.ok((await page.locator('#transportStatus').textContent()).includes('JPEG'));
    if(scenario.name==='full-en')await capture('feedback-fallback-full-en-font130.jpg');
    if(scenario.name==='full-en') {
      denyAuth=true;
      await page.locator('#pairing').waitFor({state:'visible'});
      assert.equal(await page.locator('#navigationLevel').isDisabled(),true);
      await page.waitForFunction(()=>document.getElementById('transportStatus').textContent.includes('fps: Unknown'));
      denyAuth=false;await page.locator('#token').fill('123456');await page.locator('#pairing button[type=submit]').click();
      await page.waitForFunction(()=>!document.getElementById('navigationLevel').disabled && document.getElementById('navigationValue').textContent==='-14 dB');
      report.reauthenticationRecovery=true;
    }
    assert.deepEqual(errors,[]);
    report.checks.push({scenario:scenario.name,layout,rapidGestures:true,slider:true,externalChangeSync:true,conflictReadback:true,failedSaveRecovery:true,reloadPersistence:true,
      volumePreservesMedia:true,unavailableDistinctFromZero:true,actualDimensions:true,fallbackReasonVisible:true});
    await context.close();
  }
  report.result='passed';await writeFile(resolve(output,'feedback-browser-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
