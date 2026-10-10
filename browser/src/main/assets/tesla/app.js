import {createMedia} from './media.js';
/* Local H.264/WebRTC with JPEG fallback; optional PCM playback is independent of video. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const language=(new URLSearchParams(location.search).get('lang')||navigator.language).toLowerCase();
  const zh=language.startsWith('zh'), ar=language.startsWith('ar');
  const copy = {
    menu:['菜单','Menu'], close:['关闭','Close'], showKeys:['显示虚拟按键','Show virtual keys'], hideKeys:['隐藏按键','Hide keys'], diagnostics:['实时诊断','Live diagnostics'],
    fitWindow:['使用当前窗口尺寸','Use current window size'], fitHint:['按当前可用区域填写所选配置，保存后下次连接生效；画面保持比例。','Fill the selected profile from the available window. Save for the next connection; the picture keeps its aspect ratio.'],
    unknown:['未知','Unknown'], stale:['未更新','Not updated'], resolution:['实际视频尺寸','Actual video size'], decoded:['实际解码帧率','Decoded frame rate'], dropped:['丢帧','Dropped frames'], queue:['实际音频缓冲','Queued audio'], underruns:['音频重新缓冲次数','Audio rebuffer count'], memory:['可用内存','Available memory'], battery:['电池温度','Battery temperature'], thermal:['系统热状态','System thermal status'], sampleAge:['设备采样时间','Device sample age'],
    settings:['显示设置','Display settings'], expand:['全屏','Fullscreen'], theme:['日夜','Day / night'],
    pair:['连接 DiPlay','Connect DiPlay'], pairHint:['在 Android 设备的“连接 → Tesla 浏览器”查看地址和配对码。','Find the address and pairing code in Connection → Tesla browser on the Android host.'],
    code:['配对码','Pairing code'], connect:['连接','Connect'], home:['主页','Home'], back:['返回','Back'], previous:['上一曲','Previous'], play:['播放 / 暂停','Play / pause'], next:['下一曲','Next'],
    audio:['麦克风、电话与 Siri 使用 Android','Microphone, calls and Siri use Android'],
    browserAudio:['浏览器音频（实验性）','Browser audio (experimental)'], audioOn:['浏览器音频已开启（实验性）','Browser audio enabled (experimental)'],
    buffer:['音频缓冲','Audio buffer'], transport:['视频传输','Video transport'], auto:['自动 WebRTC / JPEG','Automatic WebRTC / JPEG'],
    audioBlocked:['请再次点按允许声音；已恢复 Android 音频。','Tap again to allow sound; Android playback restored.'],
    displayHint:['右侧窗口和全屏独立保存。分辨率与帧率在下次连接生效；视频传输立即切换。Tesla 窗口模式由车辆控制。','Right and full profiles are independent. Resolution and frame rate apply at the next connection; video transport switches immediately. Select the actual window mode in Tesla.'],
    mode:['窗口配置','Window profile'], right:['右侧窗口','Right window'], full:['全屏窗口','Full window'],
    rightWidth:['右侧宽度','Right width'], rightHeight:['右侧高度','Right height'], fullWidth:['全屏宽度','Full width'], fullHeight:['全屏高度','Full height'],
    fps:['帧率 (5–30)','Frame rate (5–30)'], quality:['JPEG 画质 (40–95)','JPEG quality (40–95)'], cancel:['取消','Cancel'], save:['保存，下次连接生效','Save for next connection'],
    pending:['新配置等待下次连接','New profile applies at next connection'], reconnect:['应用并重新连接','Apply and reconnect'],
    confirm:['现在应用配置并重新连接 CarPlay？','Apply the saved profile and reconnect CarPlay now?'],
    waiting:['等待 CarPlay','Waiting for CarPlay'], disconnected:['连接中断，正在重试…','Connection lost; retrying…'], invalid:['检查配对码、分辨率和网络连接。','Check the pairing code, dimensions and network connection.'],
    unavailable:['此浏览器不支持全屏，请使用 Tesla 的窗口控制。','Fullscreen is unavailable; use Tesla window controls.']
  };
  const arabic={
    menu:'القائمة',close:'إغلاق',showKeys:'إظهار الأزرار الافتراضية',hideKeys:'إخفاء الأزرار',diagnostics:'التشخيص المباشر',
    fitWindow:'استخدام أبعاد النافذة الحالية',fitHint:'تُملأ الإعدادات المحددة من مساحة النافذة المتاحة. تسري بعد الحفظ عند الاتصال التالي؛ تُحفظ نسبة أبعاد الصورة.',
    unknown:'غير معروف',stale:'لم تُحدّث',resolution:'أبعاد الفيديو الفعلية',decoded:'معدل فك الترميز الفعلي',dropped:'الإطارات المفقودة',queue:'الصوت المخزن مؤقتًا',underruns:'مرات إعادة تخزين الصوت',memory:'الذاكرة المتاحة',battery:'حرارة البطارية',thermal:'الحالة الحرارية للنظام',sampleAge:'عمر عينة الجهاز',
    settings:'إعدادات العرض',expand:'ملء الشاشة',theme:'نهار / ليل',pair:'اتصال DiPlay',pairHint:'اعرض العنوان ورمز الاقتران في الاتصال ← متصفح Tesla على جهاز Android.',code:'رمز الاقتران',connect:'اتصال',home:'الرئيسية',back:'رجوع',previous:'السابق',play:'تشغيل / إيقاف مؤقت',next:'التالي',
    audio:'يستخدم الميكروفون والمكالمات وSiri جهاز Android',browserAudio:'صوت المتصفح (تجريبي)',audioOn:'صوت المتصفح مفعّل (تجريبي)',buffer:'تخزين الصوت مؤقتًا',transport:'نقل الفيديو',auto:'WebRTC / JPEG تلقائي',audioBlocked:'اضغط مجددًا للسماح بالصوت؛ استُعيد صوت Android.',
    displayHint:'تُحفظ إعدادات النافذة اليمنى وملء الشاشة بشكل مستقل. تسري الأبعاد ومعدل الإطارات عند الاتصال التالي؛ يتغير نقل الفيديو فورًا. تتحكم Tesla في وضع النافذة.',mode:'إعداد النافذة',right:'النافذة اليمنى',full:'ملء الشاشة',rightWidth:'عرض النافذة اليمنى',rightHeight:'ارتفاع النافذة اليمنى',fullWidth:'عرض ملء الشاشة',fullHeight:'ارتفاع ملء الشاشة',fps:'معدل الإطارات (5–30)',quality:'جودة JPEG (40–95)',cancel:'إلغاء',save:'حفظ للاتصال التالي',pending:'تسري الإعدادات الجديدة عند الاتصال التالي',reconnect:'تطبيق وإعادة الاتصال',confirm:'تطبيق الإعدادات المحفوظة وإعادة اتصال CarPlay الآن؟',waiting:'بانتظار CarPlay',disconnected:'انقطع الاتصال؛ تجري إعادة المحاولة…',invalid:'تحقق من رمز الاقتران والأبعاد واتصال الشبكة.',unavailable:'ملء الشاشة غير متاح؛ استخدم عناصر التحكم في Tesla.'
  };
  const t = key => ar?arabic[key]:copy[key][zh ? 0 : 1];
  document.documentElement.lang = ar?'ar':zh?'zh-CN':'en';
  document.documentElement.dir = ar?'rtl':'ltr';
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  let token = sessionStorage.getItem('diplay-token') || '';
  const fragment = new URLSearchParams(location.hash.slice(1)).get('token');
  if (fragment && /^[a-f0-9]{32}$/.test(fragment)) { token = fragment; sessionStorage.setItem('diplay-token', token); }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  const client = 'client-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), x => x.toString(16).padStart(2,'0')).join('');
  const canvas = $('picture'), drawing = canvas.getContext('2d');
  const screen = $('screen'), video = $('video');
  let videoMetrics = {};
  const closeMenu = () => { $('menuPanel').hidden=true; $('menuButton').setAttribute('aria-expanded','false'); $('menuButton').focus(); };
  $('menuButton').addEventListener('click',()=>{ releaseTouches(); $('menuPanel').hidden=false; $('menuButton').setAttribute('aria-expanded','true'); $('closeMenu').focus(); });
  $('closeMenu').addEventListener('click',closeMenu);
  function showKeys(show) {
    $('virtualKeys').hidden=!show; document.body.classList.toggle('keysVisible',show);
    $('keysButton').setAttribute('aria-pressed',String(show)); $('keysButton').textContent=t(show?'hideKeys':'showKeys');
    localStorage.setItem('diplay-virtual-keys',String(show));
  }
  showKeys(localStorage.getItem('diplay-virtual-keys')==='true');
  $('keysButton').addEventListener('click',()=>{ showKeys($('virtualKeys').hidden); closeMenu(); });
  $('hideKeys').addEventListener('click',()=>{ showKeys(false); $('menuButton').focus(); });
  const media = createMedia({video,getToken:()=>token,
    onTransport:mode=>{canvas.hidden=mode==='webrtc';},
    onStats:metrics=>{videoMetrics=metrics;},
    onAudio:state=>{const button=$('audioButton'),label=state.enabled?t('audioOn'):t('browserAudio');if(button.textContent!==label)button.textContent=label;button.setAttribute('aria-pressed',String(state.enabled));}
  });
  $('audioBuffer').value=localStorage.getItem('diplay-audio-buffer')||'200';
  media.audio.setBuffer(Number($('audioBuffer').value));
  $('audioButton').addEventListener('click',async()=>{
    if(media.audio.enabled)media.audio.disable();
    else if(!await media.audio.enable())$('status').textContent=t('audioBlocked');
  });
  $('audioBuffer').addEventListener('change',()=>{localStorage.setItem('diplay-audio-buffer',$('audioBuffer').value);media.audio.setBuffer(Number($('audioBuffer').value));});
  let current = null, sequence = -1, live = false, failures = 0, streamEpoch = 0;
  let touchPending = null, touchSending = false, lastTouch = 0;
  const fingers = new Map();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function api(path, body, keepalive = false) {
    const requestToken = token;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 5000);
    try {
      const response = await fetch(path, { method:body === undefined ? 'GET' : 'POST',
        headers:{ Authorization:'Bearer ' + requestToken, ...(body === undefined ? {} : {'Content-Type':'application/json'}) },
        body:body === undefined ? undefined : JSON.stringify(body), cache:'no-store', signal:abort.signal, keepalive });
      if (response.status === 401) {
        if (requestToken === token) { live = false; media.close(); $('pairing').hidden = false; }
        throw new Error(t('invalid'));
      }
      if (!response.ok) throw new Error(t('invalid'));
      return response;
    } finally { clearTimeout(timer); }
  }
  function resetPicture() { drawing.clearRect(0,0,canvas.width,canvas.height); sequence = -1; }
  async function status() {
    const state = await (await api('/api/status')).json();
    current = state;
    $('status').textContent = state.error || state.stage || (state.connected ? 'CarPlay' : t('waiting'));
    $('pending').hidden = !state.pendingReconnect || !$('reconnectPanel').hidden;
    document.querySelectorAll('[data-action]').forEach(button => { button.disabled = !state.connected; });
    if (!state.connected) resetPicture();
    updateDiagnostics(state);
    return state;
  }
  function updateDiagnostics(state) {
    const audio=media.audio.stats();
    const now=performance.now();
    if(now-jpegSample>=1000){jpegFps=jpegCount*1000/(now-jpegSample);jpegCount=0;jpegSample=now;}
    const fps=media.displayed ? videoMetrics.decodedFps : jpegFps;
    $('transportStatus').textContent=(media.displayed?'H.264 / WebRTC':'JPEG') + (Number.isFinite(fps)?' · '+fps.toFixed(1)+' fps':'');
    const device=state.device, fresh=device && device.ageMs<=6000;
    const unknown=t('unknown'), stale=t('stale'), rows=[];
    const add=(name,value)=>rows.push([name,String(value)]);
    const active=state.activeDisplay || state.display, size=active[active.mode.toLowerCase()];
    add(t('resolution'),media.displayed?`${video.videoWidth} × ${video.videoHeight}`:`${size.width} × ${size.height}`);
    add(t('decoded'),media.displayed && Number.isFinite(fps)?fps.toFixed(1)+' fps':unknown);
    add(t('dropped'),videoMetrics.dropped??unknown);
    add(t('queue'),audio.enabled?Math.round(audio.queuedMs)+' ms':t('audio'));
    add(t('underruns'),audio.underruns);
    add(t('sampleAge'),device?Math.round(device.ageMs/1000)+' s':unknown);
    add(t('memory'),fresh?Math.round(device.availableBytes/1048576)+' MiB':stale);
    add(t('battery'),fresh && Number.isFinite(device.batteryCelsius)?device.batteryCelsius.toFixed(1)+' °C':fresh?unknown:stale);
    add(t('thermal'),fresh && device.thermalStatus>=0?device.thermalStatus:fresh?unknown:stale);
    for(const sensor of device?.thermalSensors||[])add(sensor.name,fresh?sensor.celsius.toFixed(1)+' °C':stale);
    for(const cpu of device?.cpuPolicies||[]) {
      const mhz=n=>n>0?(n/1000).toFixed(0)+' MHz':unknown;
      add('CPU '+cpu.policy+' · '+(ar?'الحالي / الحد الأقصى':zh?'当前 / 策略上限':'current / policy limit'),fresh?mhz(cpu.currentKhz)+' / '+mhz(cpu.maxKhz):stale);
      add('CPU '+cpu.policy+' · '+(ar?'الحد الأقصى للأجهزة':zh?'硬件最高频率':'hardware maximum'),fresh?mhz(cpu.hardwareMaxKhz):stale);
    }
    const list=$('diagnosticValues'); list.textContent='';
    for(const [name,value] of rows) {const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=name;detail.textContent=value;list.append(term,detail);}
  }
  let jpegFps=null, jpegCount=0, jpegSample=performance.now();
  async function stream() {
    if (live) return;
    live = true;
    media.open();
    const epoch = ++streamEpoch;
    let statusAt = 0;
    while (live && epoch === streamEpoch) {
      try {
        if (document.hidden) { await delay(300); continue; }
        if (Date.now() - statusAt > 1500) { await status(); statusAt = Date.now(); }
        if (!current || !current.connected) { await delay(500); continue; }
        if (media.displayed) { sequence=-1; await delay(100); continue; }
        const start = Date.now();
        const response = await api('/api/frame?after=' + sequence);
        if (response.status === 200) {
          const blob = await response.blob();
          let picture;
          if (typeof createImageBitmap === 'function') picture = await createImageBitmap(blob);
          else {
            const url = URL.createObjectURL(blob);
            try { picture = await new Promise((resolve,reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; }); }
            finally { URL.revokeObjectURL(url); }
          }
          // Reassigning either dimension clears and reallocates the canvas backing store.
          if (canvas.width !== picture.width) canvas.width = picture.width;
          if (canvas.height !== picture.height) canvas.height = picture.height;
          drawing.drawImage(picture,0,0);
          jpegCount++;
          if (picture.close) picture.close();
          sequence = Number(response.headers.get('X-Frame-Sequence'));
        }
        failures = 0;
        const fps = (current.activeDisplay || current.display).fps;
        await delay(Math.max(15,1000/fps - (Date.now()-start)));
      } catch (error) {
        resetPicture(); releaseTouches();
        $('status').textContent = error.message || t('disconnected');
        $('pairError').textContent = error.message || t('disconnected');
        await delay(Math.min(5000,250 * 2 ** Math.min(++failures,5)));
      }
    }
  }
  function normalizedPoint(x,y) {
    const picture=media.displayed?video:canvas;
    const box = picture.getBoundingClientRect(), sourceWidth=media.displayed?video.videoWidth:canvas.width,sourceHeight=media.displayed?video.videoHeight:canvas.height;
    const scale = Math.min(box.width/sourceWidth,box.height/sourceHeight);
    const width = sourceWidth*scale, height = sourceHeight*scale;
    const left = box.left+(box.width-width)/2, top = box.top+(box.height-height)/2;
    return { x:(x-left)/width, y:(y-top)/height };
  }
  async function flushTouch() {
    if (touchSending) return;
    touchSending = true;
    try {
      while (touchPending !== null) {
        const contacts = touchPending; touchPending = null;
        await api('/api/touch',{client,contacts});
        lastTouch = Date.now();
      }
    } catch (_) { fingers.clear(); touchPending = null; }
    finally { touchSending = false; }
  }
  function queueTouches() { touchPending = Array.from(fingers.values()).sort((a,b) => a.id-b.id); flushTouch(); }
  function releaseTouches() {
    fingers.clear(); touchPending = [];
    if (token) flushTouch();
  }
  screen.addEventListener('pointerdown', event => {
    if(event.target!==canvas && event.target!==video)return;
    if (!current || !current.connected || !$('displayPanel').hidden || !$('menuPanel').hidden || !$('reconnectPanel').hidden || fingers.size >= 2) return;
    const point = normalizedPoint(event.clientX,event.clientY);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return;
    const used = Array.from(fingers.values()).map(finger => finger.id);
    fingers.set(event.pointerId,{id:used.includes(0) ? 1 : 0,...point,down:true});
    screen.setPointerCapture(event.pointerId); event.preventDefault(); queueTouches();
  });
  screen.addEventListener('pointermove', event => {
    const finger = fingers.get(event.pointerId); if (!finger) return;
    const point = normalizedPoint(event.clientX,event.clientY);
    fingers.set(event.pointerId,{...finger,x:Math.max(0,Math.min(1,point.x)),y:Math.max(0,Math.min(1,point.y))});
    touchPending = Array.from(fingers.values()).sort((a,b) => a.id-b.id);
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(name => screen.addEventListener(name,event => {
    if (fingers.delete(event.pointerId)) queueTouches();
  }));
  setInterval(() => { if (touchPending !== null || (fingers.size && Date.now()-lastTouch > 300)) queueTouches(); },50);
  window.addEventListener('blur',releaseTouches);
  window.addEventListener('pagehide',() => { media.close(); fingers.clear(); if (token) api('/api/touch',{client,contacts:[]},true).catch(() => {}); });
  document.addEventListener('visibilitychange',() => { if (document.hidden) {releaseTouches();media.close();} else media.open(); });
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click',() => {
    releaseTouches(); api('/api/action',{action:button.dataset.action}).catch(error => { $('status').textContent = error.message; });
  }));
  $('pairing').addEventListener('submit',event => {
    event.preventDefault(); token = $('token').value.trim().toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(token)) { $('pairError').textContent=t('invalid'); return; }
    $('pairError').textContent='';
    sessionStorage.setItem('diplay-token',token); $('pairing').hidden = true; media.close(); media.open(); resetPicture(); stream();
  });
  $('settingsButton').addEventListener('click',async () => {
    try {
      const state = await status(), display = state.display;
      $('mode').value = display.mode;
      ['right','full'].forEach(mode => { ['width','height'].forEach(axis => { $(mode + axis[0].toUpperCase()+axis.slice(1)).value = display[mode][axis]; }); });
      $('fps').value = display.fps; $('quality').value = display.jpegQuality;
      $('transport').value=localStorage.getItem('diplay-video')||'auto';
      releaseTouches(); closeMenu(); $('displayError').textContent = ''; $('displayPanel').hidden = false; $('mode').focus();
    } catch (error) { $('status').textContent = error.message; }
  });
  $('closeSettings').addEventListener('click',() => { $('displayPanel').hidden = true; $('menuButton').focus(); });
  $('fitWindow').addEventListener('click',()=>{
    const mode=$('mode').value.toLowerCase(),box=screen.getBoundingClientRect();
    const scale=Math.min(1,2560/box.width,1440/box.height);
    const width=Math.floor(box.width*scale/2)*2,height=Math.floor(box.height*scale/2)*2;
    if(width<320 || height<240){$('displayError').textContent=t('invalid');return;}
    $(mode+'Width').value=width; $(mode+'Height').value=height;
  });
  $('displayForm').addEventListener('submit',async event => {
    event.preventDefault();
    const size = mode => ({width:Number($(mode+'Width').value),height:Number($(mode+'Height').value)});
    try {
      await api('/api/display',{mode:$('mode').value,right:size('right'),full:size('full'),fps:Number($('fps').value),jpegQuality:Number($('quality').value)});
      if($('transport').value!==(localStorage.getItem('diplay-video')||'auto'))media.useVideo($('transport').value);
      $('displayPanel').hidden = true; $('menuButton').focus(); await status();
    } catch (error) { $('displayError').textContent = error.message; }
  });
  $('reconnectButton').addEventListener('click',() => { releaseTouches(); $('reconnectPanel').hidden=false; $('pending').hidden=true; $('cancelReconnect').focus(); });
  $('cancelReconnect').addEventListener('click',() => { $('reconnectPanel').hidden=true; $('pending').hidden=!current?.pendingReconnect; $('reconnectButton').focus(); });
  $('confirmReconnect').addEventListener('click',async () => {
    $('reconnectPanel').hidden=true;
    try { releaseTouches(); await api('/api/action',{action:'reconnect'}); resetPicture(); await status(); }
    catch (error) { $('status').textContent = error.message; }
  });
  $('expandButton').addEventListener('click',async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else $('status').textContent = t('unavailable');
    } catch (_) { $('status').textContent = t('unavailable'); }
  });
  document.body.classList.toggle('light',localStorage.getItem('diplay-light') === 'true');
  $('themeButton').addEventListener('click',() => { document.body.classList.toggle('light'); localStorage.setItem('diplay-light',String(document.body.classList.contains('light'))); });
  document.addEventListener('keydown',event => {
    if(event.key==='Escape') { if(!$('reconnectPanel').hidden)$('cancelReconnect').click(); else if(!$('displayPanel').hidden)$('closeSettings').click(); else if(!$('menuPanel').hidden)closeMenu(); else showKeys(false); }
    if(event.key==='Tab') {
      const dialog=!$('reconnectPanel').hidden?$('reconnectPanel'):!$('displayPanel').hidden?$('displayPanel'):!$('menuPanel').hidden?$('menuPanel'):null;
      if(!dialog)return;
      const nodes=[...dialog.querySelectorAll('button,input,select,summary,a[href]')].filter(node=>!node.disabled && node.getClientRects().length);
      const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  $('pairing').hidden = Boolean(token);
  if (token) stream();
})();
