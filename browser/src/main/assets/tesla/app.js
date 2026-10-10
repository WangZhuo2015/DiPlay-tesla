/* Browser output uses canvas/JPEG and same-origin HTTP; no proxy or CDN is required. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const zh = navigator.language.toLowerCase().startsWith('zh');
  const copy = {
    settings:['显示设置','Display settings'], expand:['全屏','Fullscreen'], theme:['日夜','Day / night'],
    pair:['连接 DiPlay','Connect DiPlay'], pairHint:['在 Android 设备的“连接 → Tesla 浏览器”查看地址和配对码。','Find the address and pairing code in Connection → Tesla browser on the Android host.'],
    code:['配对码','Pairing code'], connect:['连接','Connect'], home:['主页','Home'], back:['返回','Back'], previous:['上一曲','Previous'], play:['播放 / 暂停','Play / pause'], next:['下一曲','Next'],
    audio:['音频与麦克风使用 Android / iPhone 蓝牙','Audio and microphone use Android / iPhone Bluetooth'],
    displayHint:['右侧窗口和全屏独立保存。修改在下次连接生效；页面不会改变 Tesla 系统窗口模式。','Separate profiles for the right and full windows. Changes apply at the next connection. Select the actual browser window mode in Tesla.'],
    mode:['窗口配置','Window profile'], right:['右侧窗口','Right window'], full:['全屏窗口','Full window'],
    rightWidth:['右侧宽度','Right width'], rightHeight:['右侧高度','Right height'], fullWidth:['全屏宽度','Full width'], fullHeight:['全屏高度','Full height'],
    fps:['帧率 (5–30)','Frame rate (5–30)'], quality:['画质 (40–95)','JPEG quality (40–95)'], cancel:['取消','Cancel'], save:['保存，下次连接生效','Save for next connection'],
    pending:['新配置等待下次连接','New profile applies at next connection'], reconnect:['应用并重新连接','Apply and reconnect'],
    confirm:['现在应用配置并重新连接 CarPlay？','Apply the saved profile and reconnect CarPlay now?'],
    waiting:['等待 CarPlay','Waiting for CarPlay'], disconnected:['连接中断，正在重试…','Connection lost; retrying…'], invalid:['检查配对码、分辨率和网络连接。','Check the pairing code, dimensions and network connection.'],
    unavailable:['此浏览器不支持全屏，请使用 Tesla 的窗口控制。','Fullscreen is unavailable; use Tesla window controls.']
  };
  const t = key => copy[key][zh ? 0 : 1];
  document.documentElement.lang = zh ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  let token = sessionStorage.getItem('diplay-token') || '';
  const fragment = new URLSearchParams(location.hash.slice(1)).get('token');
  if (fragment && /^[a-f0-9]{32}$/.test(fragment)) { token = fragment; sessionStorage.setItem('diplay-token', token); }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  const client = 'client-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), x => x.toString(16).padStart(2,'0')).join('');
  const canvas = $('picture'), drawing = canvas.getContext('2d');
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
        if (requestToken === token) { live = false; $('pairing').hidden = false; }
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
    $('pending').hidden = !state.pendingReconnect;
    document.querySelectorAll('[data-action]').forEach(button => { button.disabled = !state.connected; });
    if (!state.connected) resetPicture();
    return state;
  }
  async function stream() {
    if (live) return;
    live = true;
    const epoch = ++streamEpoch;
    let statusAt = 0;
    while (live && epoch === streamEpoch) {
      try {
        if (document.hidden) { await delay(300); continue; }
        if (Date.now() - statusAt > 1500) { await status(); statusAt = Date.now(); }
        if (!current || !current.connected) { await delay(500); continue; }
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
          canvas.width = picture.width; canvas.height = picture.height;
          drawing.drawImage(picture,0,0);
          if (picture.close) picture.close();
          sequence = Number(response.headers.get('X-Frame-Sequence'));
        }
        failures = 0;
        const fps = (current.activeDisplay || current.display).fps;
        await delay(Math.max(15,1000/fps - (Date.now()-start)));
      } catch (error) {
        resetPicture(); releaseTouches();
        $('status').textContent = error.message || t('disconnected');
        await delay(Math.min(5000,250 * 2 ** Math.min(++failures,5)));
      }
    }
  }
  function normalizedPoint(x,y) {
    const box = canvas.getBoundingClientRect();
    const scale = Math.min(box.width/canvas.width,box.height/canvas.height);
    const width = canvas.width*scale, height = canvas.height*scale;
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
  canvas.addEventListener('pointerdown', event => {
    if (!current || !current.connected || !$('displayPanel').hidden || fingers.size >= 2) return;
    const point = normalizedPoint(event.clientX,event.clientY);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return;
    const used = Array.from(fingers.values()).map(finger => finger.id);
    fingers.set(event.pointerId,{id:used.includes(0) ? 1 : 0,...point,down:true});
    canvas.setPointerCapture(event.pointerId); event.preventDefault(); queueTouches();
  });
  canvas.addEventListener('pointermove', event => {
    const finger = fingers.get(event.pointerId); if (!finger) return;
    const point = normalizedPoint(event.clientX,event.clientY);
    fingers.set(event.pointerId,{...finger,x:Math.max(0,Math.min(1,point.x)),y:Math.max(0,Math.min(1,point.y))});
    touchPending = Array.from(fingers.values()).sort((a,b) => a.id-b.id);
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(name => canvas.addEventListener(name,event => {
    if (fingers.delete(event.pointerId)) queueTouches();
  }));
  setInterval(() => { if (touchPending !== null || (fingers.size && Date.now()-lastTouch > 300)) queueTouches(); },50);
  window.addEventListener('blur',releaseTouches);
  window.addEventListener('pagehide',() => { fingers.clear(); if (token) api('/api/touch',{client,contacts:[]},true).catch(() => {}); });
  document.addEventListener('visibilitychange',() => { if (document.hidden) releaseTouches(); });
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click',() => {
    releaseTouches(); api('/api/action',{action:button.dataset.action}).catch(error => { $('status').textContent = error.message; });
  }));
  $('pairing').addEventListener('submit',event => {
    event.preventDefault(); token = $('token').value.trim().toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(token)) return;
    sessionStorage.setItem('diplay-token',token); $('pairing').hidden = true; resetPicture(); stream();
  });
  $('settingsButton').addEventListener('click',async () => {
    try {
      const state = await status(), display = state.display;
      $('mode').value = display.mode;
      ['right','full'].forEach(mode => { ['width','height'].forEach(axis => { $(mode + axis[0].toUpperCase()+axis.slice(1)).value = display[mode][axis]; }); });
      $('fps').value = display.fps; $('quality').value = display.jpegQuality;
      releaseTouches(); $('displayError').textContent = ''; $('displayPanel').hidden = false; $('mode').focus();
    } catch (error) { $('status').textContent = error.message; }
  });
  $('closeSettings').addEventListener('click',() => { $('displayPanel').hidden = true; $('settingsButton').focus(); });
  $('displayForm').addEventListener('submit',async event => {
    event.preventDefault();
    const size = mode => ({width:Number($(mode+'Width').value),height:Number($(mode+'Height').value)});
    try {
      await api('/api/display',{mode:$('mode').value,right:size('right'),full:size('full'),fps:Number($('fps').value),jpegQuality:Number($('quality').value)});
      $('displayPanel').hidden = true; $('settingsButton').focus(); await status();
    } catch (error) { $('displayError').textContent = error.message; }
  });
  $('reconnectButton').addEventListener('click',async () => {
    if (!confirm(t('confirm'))) return;
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
  document.addEventListener('keydown',event => { if (event.key === 'Escape') $('closeSettings').click(); });
  $('pairing').hidden = Boolean(token);
  if (token) stream();
})();
