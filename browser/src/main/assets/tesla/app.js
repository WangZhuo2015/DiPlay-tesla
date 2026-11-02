import {createMedia,presentJpegFrame} from './media.js';
import {displayPreset} from './display-presets.js';
import {createTouchSender} from './browser-touch.js';
import {streamSummary,createJpegMetrics} from './stream-summary.js';
import {createNavigationVolume} from './navigation-volume.js';
import {createRtcRenderer} from './rtc-renderer.js';
/* Local H.264/WebRTC with JPEG fallback; optional PCM playback is independent of video. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const language=(new URLSearchParams(location.search).get('lang')||navigator.language).toLowerCase();
  const zh=language.startsWith('zh'), ar=language.startsWith('ar');
  const copy = {
    jpegDiagnostics:['JPEG（手动排障）','JPEG (manual diagnostics)'],
    hevcUnsupported:['此浏览器无法接收 HEVC WebRTC。请在 Android 的高级设置关闭 HEVC，并重新连接 CarPlay。','This browser cannot receive HEVC over WebRTC. Turn off HEVC in Android Advanced settings and reconnect CarPlay.'],
    jpegHevcUnsupported:['JPEG 排障模式只支持 H.264。请先关闭 Android 的 HEVC，再重新连接 CarPlay。','JPEG diagnostics require H.264. Turn off HEVC on Android, then reconnect CarPlay.'],
    browserSurface:['Tesla 浏览器','Tesla browser'],sound:['声音','Sound'],advancedAudio:['高级音频','Advanced audio'],
    audioScope:['浏览器音量进一步调低主机输出，不会自动压低音乐；旧版主机未标记的声音保持原音量。','Browser volume further lowers host output without automatic music ducking. Untagged audio from older hosts keeps its original level.'],
    hostNavigationVolume:['主机导航音量','Host navigation volume'], navigationDown:['降低导航音量','Lower navigation volume'],navigationUp:['提高导航音量','Raise navigation volume'],
    navigationHint:['只降低导航提示音，音乐音量不变。0 dB 为原始音量。立即生效，并与 Android 设置同步。','Lowers guidance only; music stays unchanged. 0 dB is the original level. Applies immediately and shares the Android setting.'],
    navigationLoading:['连接后读取已保存音量','Read saved level when connected'],navigationSaving:['正在保存…','Saving…'],navigationSaved:['已保存 · 立即生效','Saved · Applies immediately'],
    navigationConflict:['音量已在另一处更改，已读取最新值。请重新调整。','Changed elsewhere. The latest level is shown; adjust again.'],navigationFailed:['保存未确认，正在重新读取音量。','Save unconfirmed; reading the level again.'],navigationRecovered:['已重新读取当前音量，可继续调整。','Current level refreshed. You can adjust again.'],
    actualTransport:['实际视频','Actual video'],waitingVideo:['等待视频','Waiting for video'],measured:['实测显示帧率','Measured video frame rate'],
    jpegSelected:['已手动选择 JPEG；可在显示设置切回自动模式。','JPEG selected manually. Choose automatic mode in Display settings to try WebRTC.'],
    mediaBusy:['另一个网页正在使用媒体连接。请关闭该网页；本页会自动接入。','Another page is using the media connection. Close it; this page will connect automatically.'],
    rtcUnavailable:['此浏览器不支持 WebRTC；没有自动启用 JPEG。','WebRTC is unavailable in this browser. JPEG was not enabled automatically.'],
    rtcWaiting:['正在等待 WebRTC 视频；收到画面后显示实际路线。','Waiting for WebRTC video. The route appears once frames arrive.'],
    rtcFallback:['WebRTC 暂不可用，等待媒体连接恢复。','WebRTC is unavailable; waiting for media recovery.'],rtcRetry:['将自动重试 WebRTC，不会自动转为 JPEG。','WebRTC will retry without automatically switching to JPEG.'],rtcBlocked:['此视频连接不可用；可检查编解码支持、媒体地址和网络。','This video connection is unavailable. Check codec support, media addresses and networking.'],
    reasonFirst:['首帧等待超时','First video frame timed out'],reasonConnection:['媒体连接失败','Media connection failed'],reasonDecoder:['解码未继续','Video decoding stalled'],reasonStats:['浏览器统计读取失败','Browser statistics unavailable'],reasonUnsupported:['浏览器拒绝视频格式','Browser rejected the video format'],reasonPlayback:['浏览器未能播放视频','Browser could not play the video'],reasonNegotiation:['视频协商失败','Video negotiation failed'],
    menu:['菜单','Menu'], close:['关闭','Close'], showKeys:['显示虚拟按键','Show virtual keys'], hideKeys:['隐藏按键','Hide keys'], diagnostics:['实时诊断','Live diagnostics'],
    fitWindow:['适配窗口（推荐）','Fit window (recommended)'], fitHint:['先在 Tesla 选好窗口，再点预设。只修改所选尺寸；两种窗口共用帧率。','Choose the window in Tesla first, then a preset. Only the selected size changes; both windows share frame rate.'],
    fitScale:['适配缩放','Fit scale'], scaleHalf:['1/2（推荐）','1/2 (recommended)'], scaleThreeQuarters:['3/4','3/4'], scaleFull:['1×','1×'], scaleHint:['缩放宽和高；1/2 的像素量为 1/4。小窗口最低保留 320×240，实际尺寸见下方。保存后下次连接生效。','Scales width and height; 1/2 uses one quarter of the pixels. Small windows stop at 320×240 minimum; see the actual size below. Save for the next connection.'],
    presets:['画面预设','Picture presets'], presetLight:['低负载 · 720p','Low load · 720p'], presetClear:['清晰 · 1080p','Clear · 1080p'], presetQhd:['2K 清晰 · 1440p','2K clear · 1440p'], qhdHint:['2K 按窗口比例适配，最高 2560×1440，负载高于 1080p。','2K follows the window shape, up to 2560×1440, with higher load than 1080p.'], manualDisplay:['手动调整','Manual adjustments'],
    unknown:['未知','Unknown'], stale:['未更新','Not updated'], resolution:['实际视频尺寸','Actual video size'], decoded:['实际解码帧率','Decoded frame rate'], dropped:['丢帧','Dropped frames'], queue:['实际音频缓冲','Queued audio'], underruns:['音频重新缓冲次数','Audio rebuffer count'], memory:['可用内存','Available memory'], thermal:['系统热状态','System thermal status'], sampleAge:['设备采样时间','Device sample age'],
    audioEngine:['音频播放器','Audio player'],audioWorklet:['后台连续播放','Continuous background playback'],audioCompatibility:['兼容播放','Compatibility playback'],
    musicArrivalGap:['最大音乐到包间隔','Maximum music arrival gap'],
    audioPlaybackError:['音频兼容回退原因','Audio compatibility fallback reason'],musicQueue:['音乐缓冲','Music buffer'],navigationQueue:['导航／提示音缓冲','Guidance buffer'],
    musicUnderruns:['音乐重新缓冲次数','Music rebuffer count'],navigationUnderruns:['导航／提示音重新缓冲次数','Guidance rebuffer count'],audioOverruns:['音频积压恢复次数','Audio backlog recovery count'],audioArrivalGap:['最大音频到包间隔','Maximum audio arrival gap'],
    settings:['显示设置','Display settings'], expand:['全屏','Fullscreen'], theme:['日夜','Day / night'],
    pair:['连接你的主机','Connect your host'], pairHint:['在 Android 主机首页查看 6 位连接码，5 分钟内有效。配对后，此浏览器会记住主机。','Find the six-digit code on the Android host home screen. It is valid for five minutes. This browser remembers the host after pairing.'],
    code:['6 位配对码','6-digit pairing code'], connect:['连接','Connect'], home:['主页','Home'], back:['返回','Back'], previous:['上一曲','Previous'], play:['播放 / 暂停','Play / pause'], next:['下一曲','Next'],
    audio:['网页音频用于音乐与导航；通话、Siri 语音和麦克风目前由 Android 主机处理。','Browser audio plays music and navigation; calls, Siri voice and the microphone currently use the Android host.'],
    browserAudio:['浏览器音频（实验性）','Browser audio (experimental)'], audioOn:['浏览器音频已开启（实验性）','Browser audio enabled (experimental)'],audioPending:['浏览器音频 · 点按启动（实验性）','Browser audio · Tap to start (experimental)'],
    buffer:['音频缓冲','Audio buffer'], transport:['视频传输','Video transport'], auto:['WebRTC（不自动回退 JPEG）','WebRTC (no automatic JPEG fallback)'],
    musicVolume:['音乐音量','Music volume'],navigationVolume:['导航音量','Navigation volume'],
    volumeHint:['立即生效，并在此浏览器保存。100% 保留原音量，0% 静音。','Applies immediately and saves in this browser. 100% keeps the original level; 0% mutes.'],
    audioBlocked:['请再次点按允许声音；已恢复 Android 音频。','Tap again to allow sound; Android playback restored.'],
    displayHint:['右侧与全屏尺寸独立保存，下次连接生效。','Right and full sizes are saved independently for the next connection.'],
    transportHint:['视频传输在保存后立即切换。','Video transport switches immediately after saving.'],
    renderer:['WebRTC 显示方式','WebRTC presentation'],nativeRenderer:['原生视频（默认）','Native video (default)'],canvasRenderer:['Canvas（实验性）','Canvas (experimental)'],
    rendererHint:['Canvas 可用于排查浏览器视频显示异常，会增加绘制开销。保存后立即应用，不重连 CarPlay。','Canvas can help with browser video presentation problems and adds drawing work. Applies on save without reconnecting CarPlay.'],
    rendererFailed:['Canvas 绘制失败，已恢复原生视频。','Canvas rendering failed; native video restored.'],
    recovery:['WebRTC 恢复等待','WebRTC recovery wait'],quickRecovery:['4 秒 · 快速重试','4 seconds · Quick retry'],balancedRecovery:['10 秒 · 均衡（默认）','10 seconds · Balanced (default)'],patientRecovery:['30 秒 · 等待恢复','30 seconds · Patient'],
    recoveryHint:['短暂中断时保留最后画面，超时后重建 WebRTC，不自动切换 JPEG。保存后重建浏览器媒体连接，不会重连 iPhone。','Keep the last picture during a short interruption, then rebuild WebRTC without switching to JPEG. Saving restarts browser media only, without reconnecting the iPhone.'],
    jpegLimit:['60 fps 用于 WebRTC；JPEG 转换最高 30 fps。保存帧率后，下次 CarPlay 连接生效。','60 fps is available for WebRTC; JPEG conversion is capped at 30 fps. A saved frame rate applies at the next CarPlay connection.'],
    recovering:['正在恢复视频','Recovering video'],videoQueue:['压缩视频队列','Compressed video queue'],queueBudget:['视频排队时限','Video queue budget'],expiredFrames:['过期帧丢弃','Expired frames'],overflowFrames:['队列溢出丢弃','Queue overflow drops'],keyframeSkips:['等待关键帧跳过','Skipped until keyframe'],sendFailures:['本地发送失败','Local send failures'],fallbackReason:['视频回退原因','Video fallback reason'],
    mode:['窗口配置','Window profile'], right:['右侧窗口','Right window'], full:['全屏窗口','Full window'],
    rightWidth:['右侧宽度','Right width'], rightHeight:['右侧高度','Right height'], fullWidth:['全屏宽度','Full width'], fullHeight:['全屏高度','Full height'],
    fps:['帧率 (5–60)','Frame rate (5–60)'], quality:['JPEG 画质 (40–95)','JPEG quality (40–95)'], cancel:['取消','Cancel'], save:['保存，下次连接生效','Save for next connection'],
    pending:['新配置等待下次连接','New profile applies at next connection'], reconnect:['应用并重新连接','Apply and reconnect'],
    confirm:['现在应用配置并重新连接 CarPlay？','Apply the saved profile and reconnect CarPlay now?'],
    waiting:['等待 CarPlay','Waiting for CarPlay'], disconnected:['连接中断，正在重试…','Connection lost; retrying…'], invalid:['检查配对码、分辨率和网络连接。','Check the pairing code, dimensions and network connection.'],
    unavailable:['此浏览器不支持全屏，请使用 Tesla 的窗口控制。','Fullscreen is unavailable; use Tesla window controls.']
  };
  const arabic={
    hevcUnsupported:'لا يدعم هذا المتصفح استقبال HEVC عبر WebRTC. عطّل HEVC من الإعدادات المتقدمة على Android ثم أعد اتصال CarPlay.',
    mediaBusy:'تستخدم صفحة أخرى اتصال الوسائط. أغلقها وستتصل هذه الصفحة تلقائيًا.',
    jpegHevcUnsupported:'يتطلب وضع تشخيص JPEG فيديو H.264. عطّل HEVC على Android ثم أعد اتصال CarPlay.',
    jpegDiagnostics:'JPEG (تشخيص يدوي)',
    browserSurface:'متصفح Tesla',sound:'الصوت',advancedAudio:'إعدادات الصوت المتقدمة',
    audioScope:'يخفض مستوى صوت المتصفح خرج المضيف دون خفض الموسيقى تلقائيًا. يحتفظ الصوت غير المصنّف من المضيف القديم بمستواه الأصلي.',
    hostNavigationVolume:'مستوى صوت الملاحة على المضيف',navigationDown:'خفض صوت الملاحة',navigationUp:'رفع صوت الملاحة',navigationHint:'يخفض إرشادات الملاحة فقط دون تغيير الموسيقى. \u20660 dB\u2069 هو المستوى الأصلي. يُطبّق فورًا ويستخدم إعداد Android نفسه.',
    navigationLoading:'ستُقرأ القيمة المحفوظة بعد الاتصال',navigationSaving:'جارٍ الحفظ…',navigationSaved:'تم الحفظ · يُطبّق فورًا',navigationConflict:'تغيّر المستوى في مكان آخر. تظهر أحدث قيمة؛ اضبطه مجددًا.',navigationFailed:'لم يُؤكّد الحفظ؛ تجري قراءة المستوى مجددًا.',navigationRecovered:'قُرئ المستوى الحالي؛ يمكنك ضبطه مجددًا.',
    actualTransport:'الفيديو الفعلي',waitingVideo:'بانتظار الفيديو',measured:'معدل عرض الفيديو المقاس',jpegSelected:'اختير JPEG يدويًا. اختر الوضع التلقائي في إعدادات العرض لتجربة WebRTC.',rtcUnavailable:'WebRTC غير متاح في هذا المتصفح. لم يتم تشغيل JPEG تلقائيًا.',rtcWaiting:'بانتظار فيديو WebRTC. يظهر المسار عند وصول الإطارات.',rtcFallback:'WebRTC غير متاح حاليًا؛ بانتظار استعادة اتصال الوسائط.',rtcRetry:'ستُعاد محاولة WebRTC دون تشغيل JPEG تلقائيًا.',rtcBlocked:'أبلغ المتصفح عن اتصال فيديو غير مدعوم. تحقّق من البرنامج الثابت وإعدادات العرض.',
    reasonFirst:'انتهت مهلة أول إطار',reasonConnection:'فشل اتصال الوسائط',reasonDecoder:'توقف فك ترميز الفيديو',reasonStats:'إحصاءات المتصفح غير متاحة',reasonUnsupported:'رفض المتصفح تنسيق الفيديو',reasonPlayback:'تعذّر تشغيل الفيديو',reasonNegotiation:'فشل تفاوض الفيديو',
    musicVolume:'مستوى صوت الموسيقى',navigationVolume:'مستوى صوت الملاحة',volumeHint:'يُطبّق فورًا ويُحفظ في هذا المتصفح. 100% للمستوى الأصلي و0% للكتم.',
    renderer:'طريقة عرض WebRTC',nativeRenderer:'الفيديو الأصلي (افتراضي)',canvasRenderer:'Canvas (تجريبي)',rendererHint:'قد يساعد Canvas في مشاكل عرض الفيديو في المتصفح ويزيد عمل الرسم. يُطبّق عند الحفظ دون إعادة اتصال CarPlay.',rendererFailed:'تعذّر الرسم على Canvas؛ استُعيد الفيديو الأصلي.',
    recovery:'مهلة استعادة WebRTC',quickRecovery:'4 ثوانٍ · إعادة محاولة سريعة',balancedRecovery:'10 ثوانٍ · متوازن (افتراضي)',patientRecovery:'30 ثانية · انتظار الاستعادة',recoveryHint:'تُحفظ الصورة الأخيرة أثناء الانقطاع القصير، ثم يعاد اتصال WebRTC دون الانتقال إلى JPEG. يعيد الحفظ اتصال وسائط المتصفح فقط دون إعادة اتصال iPhone.',jpegLimit:'يتوفر 60 إطارًا في الثانية لـ WebRTC؛ تحويل JPEG محدود بـ 30 إطارًا. يسري معدل الإطارات المحفوظ عند اتصال CarPlay التالي.',
    recovering:'تجري استعادة الفيديو',videoQueue:'قائمة انتظار الفيديو المضغوط',queueBudget:'مهلة انتظار الفيديو',expiredFrames:'الإطارات المنتهية',overflowFrames:'الإطارات المتجاوزة للسعة',keyframeSkips:'الإطارات المتخطاة حتى الإطار الرئيسي',sendFailures:'إخفاقات الإرسال المحلي',fallbackReason:'سبب الانتقال إلى JPEG',
    menu:'القائمة',close:'إغلاق',showKeys:'إظهار الأزرار الافتراضية',hideKeys:'إخفاء الأزرار',diagnostics:'التشخيص المباشر',
    fitWindow:'ملاءمة النافذة (موصى به)',fitHint:'اختر النافذة في Tesla أولًا، ثم إعدادًا مسبقًا. تتغير الأبعاد المحددة فقط؛ معدل الإطارات مشترك.',
    fitScale:'مقياس الملاءمة',scaleHalf:'1/2 (موصى به)',scaleThreeQuarters:'3/4',scaleFull:'1×',scaleHint:'يُغيّر العرض والارتفاع؛ يستخدم النصف ربع عدد البكسلات. الحد الأدنى للنوافذ الصغيرة هو \u2066320×240\u2069؛ تظهر الأبعاد الفعلية أدناه. احفظ للاتصال التالي.',
    presets:'إعدادات الصورة المسبقة',presetLight:'حمل منخفض · 720p',presetClear:'وضوح · 1080p',presetQhd:'وضوح 2K · 1440p',qhdHint:'تتبع أبعاد 2K نسبة النافذة حتى \u20662560×1440\u2069، بحمل أعلى من 1080p.',manualDisplay:'ضبط يدوي',
    unknown:'غير معروف',stale:'لم تُحدّث',resolution:'أبعاد الفيديو الفعلية',decoded:'معدل فك الترميز الفعلي',dropped:'الإطارات المفقودة',queue:'الصوت المخزن مؤقتًا',underruns:'مرات إعادة تخزين الصوت',memory:'الذاكرة المتاحة',thermal:'الحالة الحرارية للنظام',sampleAge:'عمر عينة الجهاز',
    audioEngine:'مشغل الصوت',audioWorklet:'تشغيل مستمر في الخلفية',audioCompatibility:'تشغيل متوافق',audioPlaybackError:'سبب الرجوع إلى التشغيل المتوافق',
    musicQueue:'مخزن الموسيقى',navigationQueue:'مخزن الإرشادات',musicUnderruns:'مرات إعادة تخزين الموسيقى',navigationUnderruns:'مرات إعادة تخزين الإرشادات',
    audioOverruns:'مرات استعادة تراكم الصوت',audioArrivalGap:'أطول فترة بين حزم الصوت',
    musicArrivalGap:'أطول فترة بين حزم الموسيقى',
    settings:'إعدادات العرض',expand:'ملء الشاشة',theme:'نهار / ليل',pair:'اتصال بالمضيف',pairHint:'اعرض رمز الاتصال المكوّن من ستة أرقام على الصفحة الرئيسية لجهاز Android المضيف. صالح لخمس دقائق. يتذكر المتصفح المضيف بعد الاقتران.',code:'رمز الاقتران من 6 أرقام',connect:'اتصال',home:'الرئيسية',back:'رجوع',previous:'السابق',play:'تشغيل / إيقاف مؤقت',next:'التالي',
    audio:'يشغّل المتصفح الموسيقى وإرشادات الملاحة؛ تستخدم المكالمات وصوت Siri والميكروفون جهاز Android المضيف حاليًا.',browserAudio:'صوت المتصفح (تجريبي)',audioOn:'صوت المتصفح مفعّل (تجريبي)',audioPending:'صوت المتصفح · اضغط للتشغيل (تجريبي)',buffer:'تخزين الصوت مؤقتًا',transport:'نقل الفيديو',auto:'WebRTC (دون انتقال تلقائي إلى JPEG)',audioBlocked:'اضغط مجددًا للسماح بالصوت؛ استُعيد صوت Android.',
    displayHint:'تُحفظ أبعاد النافذة اليمنى والكاملة بشكل مستقل للاتصال التالي.',transportHint:'يتغير نقل الفيديو فورًا بعد الحفظ.',mode:'إعداد النافذة',right:'النافذة اليمنى',full:'ملء الشاشة',rightWidth:'عرض النافذة اليمنى',rightHeight:'ارتفاع النافذة اليمنى',fullWidth:'عرض ملء الشاشة',fullHeight:'ارتفاع ملء الشاشة',fps:'معدل الإطارات (\u20665–60\u2069)',quality:'جودة JPEG (40–95)',cancel:'إلغاء',save:'حفظ للاتصال التالي',pending:'تسري الإعدادات الجديدة عند الاتصال التالي',reconnect:'تطبيق وإعادة الاتصال',confirm:'تطبيق الإعدادات المحفوظة وإعادة اتصال CarPlay الآن؟',waiting:'بانتظار CarPlay',disconnected:'انقطع الاتصال؛ تجري إعادة المحاولة…',invalid:'تحقق من رمز الاقتران والأبعاد واتصال الشبكة.',unavailable:'ملء الشاشة غير متاح؛ استخدم عناصر التحكم في Tesla.'
  };
  const t = key => ar?arabic[key]:copy[key][zh ? 0 : 1];
  document.documentElement.lang = ar?'ar':zh?'zh-CN':'en';
  document.documentElement.dir = ar?'rtl':'ltr';
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  $('menuButton').setAttribute('aria-label',t('menu'));$('menuButton').title=t('menu');
  function rememberToken(value) { token=value; localStorage.setItem('diplay-token',value); sessionStorage.removeItem('diplay-token'); }
  let token = localStorage.getItem('diplay-token') || sessionStorage.getItem('diplay-token') || '';
  if (!/^[a-f0-9]{32}$/.test(token)) token='';
  const fragments = new URLSearchParams(location.hash.slice(1));
  const fragment = fragments.get('token'), pairingCode = fragments.get('code');
  if (fragment && /^[a-f0-9]{32}$/.test(fragment)) rememberToken(fragment);
  else if(token)rememberToken(token);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  const client = 'client-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), x => x.toString(16).padStart(2,'0')).join('');
  const canvas = $('picture'), drawing = canvas.getContext('2d');
  const screen = $('screen'), video = $('video');
  let videoMetrics = {}, rendererNotice = null, videoTransport='waiting';
  const jpegMetrics=createJpegMetrics();
  const renderer = createRtcRenderer({video,canvas,onError:()=>{
    rendererNotice=t('rendererFailed');
    localStorage.setItem('diplay-rtc-renderer','native');$('renderer').value='native';
    $('status').textContent=rendererNotice;
  }});
  renderer.setMode(localStorage.getItem('diplay-rtc-renderer'));
  let menuPeekTimer;
  function peekMenu() {
    clearTimeout(menuPeekTimer);$('menuButton').classList.add('menuPeek');
    menuPeekTimer=setTimeout(()=>$('menuButton').classList.remove('menuPeek'),2000);
  }
  $('menuButton').addEventListener('pointerenter',peekMenu);peekMenu();
  const closeMenu = () => { $('menuPanel').hidden=true; $('menuButton').setAttribute('aria-expanded','false'); peekMenu();$('menuButton').focus(); };
  const openMenu = () => { releaseTouches(); $('menuPanel').hidden=false; $('menuButton').setAttribute('aria-expanded','true'); $('closeMenu').focus(); };
  $('menuButton').addEventListener('click',openMenu);
  $('closeMenu').addEventListener('click',closeMenu);
  $('menuPanel').addEventListener('click',event=>{if(event.target===$('menuPanel'))closeMenu();});
  function showKeys(show) {
    $('virtualKeys').hidden=!show; document.body.classList.toggle('keysVisible',show);
    $('keysButton').setAttribute('aria-pressed',String(show)); $('keysButton').textContent=t(show?'hideKeys':'showKeys');
    localStorage.setItem('diplay-virtual-keys',String(show));
  }
  showKeys(localStorage.getItem('diplay-virtual-keys')==='true');
  $('keysButton').addEventListener('click',()=>{ showKeys($('virtualKeys').hidden); closeMenu(); });
  $('hideKeys').addEventListener('click',()=>{ showKeys(false); $('menuButton').focus(); });
  let hevcErrorAnnounced=false;
  const media = createMedia({video,getToken:()=>token,
    onTransport:mode=>{
      if(mode!==videoTransport){jpegMetrics.reset();sequence=-1;}
      videoTransport=mode;renderer.setActive(mode==='webrtc');releaseTouches();
    },
    onStats:metrics=>{
      videoMetrics=metrics;
      if(!metrics.fallbackReason)hevcErrorAnnounced=false;
      if(metrics.fallbackReason==='hevc-unsupported' && !hevcErrorAnnounced && $('displayPanel').hidden && $('pairing').hidden) {
        hevcErrorAnnounced=true;openMenu();
      }
    },
    onAudio:state=>{const button=$('audioButton'),label=t(state.enabled?'audioOn':media.audioPreference.wanted?'audioPending':'browserAudio');if(button.textContent!==label)button.textContent=label;button.setAttribute('aria-pressed',String(state.enabled));}
  });
  $('audioBuffer').value=localStorage.getItem('diplay-audio-buffer')||'200';
  media.audio.setBuffer(Number($('audioBuffer').value));
  for (const role of ['music','navigation']) {
    const slider = $(role+'Volume'), output = $(role+'VolumeValue');
    const show = percent => { slider.value=String(percent); output.value=percent+'%'; slider.setAttribute('aria-valuetext',percent+'%'); };
    show(media.audio.volumes[role]);
    slider.addEventListener('input',()=>show(media.setAudioVolume(role,slider.value)));
  }
  $('audioButton').addEventListener('click',async()=>{
    const enabled=await media.audioPreference.toggle();
    if(!enabled && media.audioPreference.wanted)$('status').textContent=t('audioBlocked');
  });
  const startPreferredAudio=event=>{
    if(event.isTrusted && !(event.target instanceof Element && event.target.closest('#audioButton')))media.audioPreference.start();
  };
  document.addEventListener('pointerup',startPreferredAudio,true);
  document.addEventListener('keydown',event=>{if(!event.repeat)startPreferredAudio(event);},true);
  $('audioBuffer').addEventListener('change',()=>{localStorage.setItem('diplay-audio-buffer',$('audioBuffer').value);media.audio.setBuffer(Number($('audioBuffer').value));});
  const navigationVolume=createNavigationVolume({
    save:async body=>{
      const response=await api('/api/navigation-volume',body,false,true);
      const state=await response.json();
      return {value:state.navigationAttenuationDb,conflict:response.status===409};
    },
    onState:state=>{
      const level=$('navigationLevel');
      if(state.value!==null)level.value=String(state.value);
      level.disabled=!state.ready;
      level.setAttribute('aria-busy',String(state.busy));
      $('navigationDown').disabled=!state.ready || state.value<=-20;
      $('navigationUp').disabled=!state.ready || state.value>=0;
      $('navigationValue').textContent=state.value===null?'—':`${state.value} dB`;
      level.setAttribute('aria-valuetext',state.value===null?t('unknown'):`${state.value} dB`);
      const key=state.busy?'navigationSaving':state.issue==='conflict'?'navigationConflict':state.issue==='failed'?(state.ready?'navigationRecovered':'navigationFailed'):state.ready?'navigationSaved':'navigationLoading';
      $('navigationState').textContent=t(key);
      $('navigationState').dataset.issue=String(state.issue==='conflict' || state.issue==='failed' && !state.ready);
    }
  });
  $('navigationDown').setAttribute('aria-label',t('navigationDown'));
  $('navigationUp').setAttribute('aria-label',t('navigationUp'));
  $('navigationLevel').addEventListener('input',()=>navigationVolume.set(Number($('navigationLevel').value)));
  $('navigationDown').addEventListener('click',()=>navigationVolume.step(-1));
  $('navigationUp').addEventListener('click',()=>navigationVolume.step(1));
  navigationVolume.unavailable();
  let requestedStatus=0,appliedStatus=0;
  let statusAvailable=false;
  let current = null, sequence = -1, live = false, failures = 0, streamEpoch = 0;
  const fingers = new Map();
  const touchSender=createTouchSender({send:contacts=>api('/api/touch',{client,contacts}),onError:()=>fingers.clear()});
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function api(path, body, keepalive = false, allowConflict = false) {
    const requestToken = token;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 5000);
    try {
      const response = await fetch(path, { method:body === undefined ? 'GET' : 'POST',
        headers:{ Authorization:'Bearer ' + requestToken, ...(body === undefined ? {} : {'Content-Type':'application/json'}) },
        body:body === undefined ? undefined : JSON.stringify(body), cache:'no-store', signal:abort.signal, keepalive });
      if (response.status === 401) {
        if (requestToken === token) {
          live=false;statusAvailable=false;media.close();resetPicture();navigationVolume.unavailable();token='';
          localStorage.removeItem('diplay-token');sessionStorage.removeItem('diplay-token');
          closeMenu();$('displayPanel').hidden=true;$('reconnectPanel').hidden=true;$('pending').hidden=true;
          $('pairing').hidden=false;$('token').focus();
        }
        throw new Error(t('invalid'));
      }
      if (!response.ok && !(allowConflict && response.status===409)) throw new Error(t('invalid'));
      return response;
    } finally { clearTimeout(timer); }
  }
  function resetPicture() { drawing.clearRect(0,0,canvas.width,canvas.height); sequence = -1; jpegMetrics.reset(); }
  async function status() {
    const request=++requestedStatus, readEpoch=navigationVolume.epoch;
    const state = await (await api('/api/status')).json();
    if(request<appliedStatus)return current;
    appliedStatus=request;current = state;statusAvailable=true;
    navigationVolume.observe(state.navigationAttenuationDb,readEpoch);
    $('status').textContent = state.error || rendererNotice || (videoMetrics.recovering ? t('recovering') : null) || state.stage || (state.connected ? 'CarPlay' : t('waiting'));
    $('pending').hidden = !state.pendingReconnect || !$('reconnectPanel').hidden;
    document.querySelectorAll('[data-action]').forEach(button => { button.disabled = !state.connected; });
    if (!state.connected) resetPicture();
    updateDiagnostics(state);
    return state;
  }
  function updateDiagnostics(state) {
    const audio=media.audio.stats();
    const jpeg=jpegMetrics.sample();
    const connected=Boolean(statusAvailable && state.connected && token && !document.hidden);
    const jpegSelected=!media.busy && media.mode==='jpeg' && state.videoCodec!=='H265';
    const fps=connected?(media.displayed?videoMetrics.decodedFps:jpegSelected?jpeg.fps:null):null;
    const device=state.device, fresh=device && device.ageMs>=0 && device.ageMs<=6000;
    const unknown=t('unknown'), stale=t('stale'), rows=[];
    const add=(name,value)=>rows.push([name,String(value)]);
    const width=connected?(media.displayed?video.videoWidth:jpegSelected?jpeg.width:0):0;
    const height=connected?(media.displayed?video.videoHeight:jpegSelected?jpeg.height:0):0;
    const codec=state.videoCodec==='H265'?'HEVC':state.videoCodec==='H264'?'H.264':null;
    const route=connected && width>0?(media.displayed?(codec?codec+' / WebRTC':'WebRTC'):'JPEG'):t('waitingVideo');
    $('transportStatus').replaceChildren(...[t('actualTransport'),...streamSummary({transport:route,width,height,fps,device},{stale,unknown})].flatMap((part,index)=>{
      const span=document.createElement('span');span.dir=/^(?:H\.264|HEVC|JPEG|SoC|\d)/.test(part)?'ltr':'auto';span.textContent=part;
      return index?[document.createTextNode(' · '),span]:[span];
    }));
    const reason=videoMetrics.fallbackReason;
    const reasonKeys={'first-frame-timeout':'reasonFirst','connection-failed':'reasonConnection','connection-timeout':'reasonConnection','disconnected-timeout':'reasonConnection','decoder-stall':'reasonDecoder','stats-timeout':'reasonStats','video-unsupported':'reasonUnsupported','playback-failed':'reasonPlayback','negotiation-failed':'reasonNegotiation','answer-rejected':'reasonNegotiation'};
    let explanation='';
    if(media.busy)explanation=t('mediaBusy');
    else if(!connected)explanation=t(statusAvailable && token?'waiting':'disconnected');
    else if(!media.displayed) {
      if(media.mode==='jpeg')explanation=t(state.videoCodec==='H265'?'jpegHevcUnsupported':'jpegSelected');
      else if(reason==='hevc-unsupported')explanation=t('hevcUnsupported');
      else if(typeof RTCPeerConnection!=='function')explanation=t('rtcUnavailable');
      else if(reason)explanation=t(reasonKeys[reason]||'rtcFallback')+` (${reason}). `+t(videoMetrics.rtcRetryBlocked?'rtcBlocked':'rtcRetry');
      else explanation=t('rtcWaiting');
    }
    $('videoExplanation').textContent=explanation;
    $('videoExplanation').hidden=!explanation;
    add(t('resolution'),width && height?`${width} × ${height}`:unknown);
    add(t('measured'),Number.isFinite(fps) && fps>=0?fps.toFixed(1)+' fps':unknown);
    add(t('dropped'),videoMetrics.dropped??unknown);
    if(Number.isFinite(videoMetrics.queueFrames))add(t('videoQueue'),`${videoMetrics.queueFrames} / ${Math.round(videoMetrics.queueBytes/1024)} KiB`);
    if(Number.isFinite(videoMetrics.queueBudgetMs))add(t('queueBudget'),videoMetrics.queueBudgetMs+' ms');
    for(const key of ['expiredFrames','overflowFrames','keyframeSkips','sendFailures'])if(Number.isFinite(videoMetrics[key]))add(t(key),videoMetrics[key]);
    if(videoMetrics.fallbackReason)add(t('fallbackReason'),videoMetrics.fallbackReason);
    add(t('queue'),audio.enabled?Math.round(audio.queuedMs)+' ms':t('audio'));
    add(t('underruns'),audio.underruns);
    add(t('audioEngine'),t(audio.engine==='worklet'?'audioWorklet':'audioCompatibility'));
    if(audio.playbackError)add(t('audioPlaybackError'),audio.playbackError);
    if(Number.isFinite(audio.musicQueuedMs))add(t('musicQueue'),Math.round(audio.musicQueuedMs)+' ms');
    if(Number.isFinite(audio.navigationQueuedMs))add(t('navigationQueue'),Math.round(audio.navigationQueuedMs)+' ms');
    add(t('musicUnderruns'),audio.musicUnderruns);
    add(t('navigationUnderruns'),audio.navigationUnderruns);
    add(t('audioOverruns'),audio.overruns);
    if(Number.isFinite(audio.maxArrivalGapMs))add(t('audioArrivalGap'),Math.round(audio.maxArrivalGapMs)+' ms');
    if(Number.isFinite(audio.musicMaxGapMs))add(t('musicArrivalGap'),Math.round(audio.musicMaxGapMs)+' ms');
    add(t('sampleAge'),device?Math.round(device.ageMs/1000)+' s':unknown);
    add(t('memory'),fresh?Math.round(device.availableBytes/1048576)+' MiB':stale);
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
  setInterval(()=>{if(current)updateDiagnostics(current);},1000);
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
        // JPEG conversion on V50 is opt-in. Waiting/recovery must not start a software decoder.
        if (media.busy || media.displayed || media.mode!=='jpeg' || current.videoCodec==='H265') {
          sequence=-1; await delay(100); continue;
        }
        const start = Date.now();
        const response = await api('/api/frame?after=' + sequence);
        jpegMetrics.activity();
        if (response.status === 200) {
          const shown = await presentJpegFrame({response,canvas,drawing,
            isCurrent:()=>!media.busy && media.mode==='jpeg' && current.videoCodec!=='H265' && !media.displayed && live && epoch===streamEpoch && !document.hidden});
          if (!shown) continue;
          jpegMetrics.frame(canvas.width,canvas.height);
          sequence = Number(response.headers.get('X-Frame-Sequence'));
        }
        failures = 0;
        const profile = current.activeDisplay || current.display;
        const fps = profile.jpegFps || Math.min(profile.fps,30);
        await delay(Math.max(15,1000/fps - (Date.now()-start)));
      } catch (error) {
        statusAvailable=false; resetPicture(); releaseTouches(); navigationVolume.unavailable();
        if(current)updateDiagnostics({...current,connected:false});
        $('status').textContent = error.message || t('disconnected');
        $('pairError').textContent = error.message || t('disconnected');
        await delay(Math.min(5000,250 * 2 ** Math.min(++failures,5)));
      }
    }
  }
  function normalizedPoint(x,y) {
    const picture=renderer.surface;
    const box = picture.getBoundingClientRect(), sourceWidth=media.displayed?video.videoWidth:canvas.width,sourceHeight=media.displayed?video.videoHeight:canvas.height;
    const scale = Math.min(box.width/sourceWidth,box.height/sourceHeight);
    const width = sourceWidth*scale, height = sourceHeight*scale;
    const left = box.left+(box.width-width)/2, top = box.top+(box.height-height)/2;
    return { x:(x-left)/width, y:(y-top)/height };
  }
  function queueTouches() { touchSender.transition(Array.from(fingers.values())); }
  function releaseTouches() {
    fingers.clear();
    if (token) touchSender.cancel();
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
    touchSender.motion(Array.from(fingers.values()));
  });
  screen.addEventListener('pointerup',event=>{
    const finger=fingers.get(event.pointerId);if(!finger)return;
    const point=normalizedPoint(event.clientX,event.clientY);
    const released={...finger,x:Number.isFinite(point.x)?Math.max(0,Math.min(1,point.x)):finger.x,y:Number.isFinite(point.y)?Math.max(0,Math.min(1,point.y)):finger.y,down:false};
    fingers.delete(event.pointerId);
    touchSender.transition([...fingers.values(),released]);
  });
  ['pointercancel','lostpointercapture'].forEach(name=>screen.addEventListener(name,event=>{
    if(fingers.has(event.pointerId))releaseTouches();
  }));
  setInterval(()=>touchSender.heartbeat(Array.from(fingers.values())),50);
  window.addEventListener('blur',releaseTouches);
  window.addEventListener('pagehide',() => { navigationVolume.unavailable(); media.close(); fingers.clear(); if (token) api('/api/touch',{client,contacts:[]},true).catch(() => {}); });
  document.addEventListener('visibilitychange',() => { if (document.hidden) {releaseTouches();media.close();navigationVolume.unavailable();} else {media.open();status().catch(()=>navigationVolume.unavailable());} });
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click',() => {
    releaseTouches(); api('/api/action',{action:button.dataset.action}).catch(error => { $('status').textContent = error.message; });
  }));
  async function pair(code) {
    if (!/^[0-9]{6}$/.test(code)) { $('pairError').textContent=t('invalid'); return; }
    const button=$('pairing').querySelector('button[type="submit"]');
    button.disabled=true; $('pairError').textContent='';
    const abort=new AbortController(), timer=setTimeout(()=>abort.abort(),5000);
    try {
      const response=await fetch('/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code}),cache:'no-store',signal:abort.signal});
      if(!response.ok)throw new Error(t('invalid'));
      const credential=(await response.json()).token;
      if(!/^[a-f0-9]{32}$/.test(credential))throw new Error(t('invalid'));
      rememberToken(credential); $('token').value=''; $('pairing').hidden=true;
      media.close(); resetPicture(); stream();
    } catch (_) { $('pairError').textContent=t('invalid'); }
    finally { clearTimeout(timer); button.disabled=false; }
  }
  $('pairing').addEventListener('submit',event => { event.preventDefault(); pair($('token').value.trim()); });
  function displaySummary() {
    const mode=$('mode').value.toLowerCase();
    $('displaySummary').textContent=`${$(mode+'Width').value} × ${$(mode+'Height').value} · ${$('fps').value} fps`;
  }
  let fitScales = {}, changedFitScales = new Set();
  function rememberedScale(mode) {
    const value=Number(localStorage.getItem('diplay-fit-scale-'+mode));
    return [.5,.75,1].includes(value)?value:.5;
  }
  function clearPreset() { document.querySelectorAll('[data-preset]').forEach(button=>button.setAttribute('aria-pressed','false')); $('fitScaling').hidden=true; displaySummary(); }
  $('settingsButton').addEventListener('click',async () => {
    try {
      const state = await status(), display = state.display;
      $('mode').value = display.mode;
      ['right','full'].forEach(mode => { ['width','height'].forEach(axis => { $(mode + axis[0].toUpperCase()+axis.slice(1)).value = display[mode][axis]; }); });
      $('fps').value = display.fps; $('quality').value = display.jpegQuality;
      $('transport').value=localStorage.getItem('diplay-video')||'auto';
      $('renderer').value=renderer.mode;
      $('recovery').value=String(media.recoveryGraceMs);
      fitScales={right:rememberedScale('right'),full:rememberedScale('full')}; changedFitScales.clear();
      $('fitScale').value=String(fitScales[display.mode.toLowerCase()]);
      $('manualDisplay').open=false; clearPreset();
      releaseTouches(); closeMenu(); $('displayError').textContent = ''; $('displayPanel').hidden = false; $('mode').focus();
    } catch (error) { $('status').textContent = error.message; }
  });
  $('closeSettings').addEventListener('click',() => { $('displayPanel').hidden = true; $('menuButton').focus(); });
  $('mode').addEventListener('change',()=>{ $('fitScale').value=String(fitScales[$('mode').value.toLowerCase()]); clearPreset(); });
  $('manualDisplay').addEventListener('input',clearPreset);
  function applyPreset(button) {
    const mode=$('mode').value.toLowerCase(),box=screen.getBoundingClientRect();
    const preset=displayPreset(button.dataset.preset,box.width,box.height,window.devicePixelRatio||1,Number($('fitScale').value));
    if(!preset){$('displayError').textContent=t('invalid');return;}
    $(mode+'Width').value=preset.width; $(mode+'Height').value=preset.height;
    $('fps').value=preset.fps; $('quality').value=preset.jpegQuality;
    $('displayError').textContent=''; clearPreset(); button.setAttribute('aria-pressed','true');
    if(button.dataset.preset==='fit') {
      $('fitScaling').hidden=false; fitScales[mode]=Number($('fitScale').value); changedFitScales.add(mode);
    }
  }
  document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>applyPreset(button)));
  $('fitScale').addEventListener('change',()=>applyPreset($('fitWindow')));
  $('displayForm').addEventListener('submit',async event => {
    event.preventDefault();
    const size = mode => ({width:Number($(mode+'Width').value),height:Number($(mode+'Height').value)});
    try {
      await api('/api/display',{mode:$('mode').value,right:size('right'),full:size('full'),fps:Number($('fps').value),jpegQuality:Number($('quality').value)});
      changedFitScales.forEach(mode=>localStorage.setItem('diplay-fit-scale-'+mode,String(fitScales[mode])));
      rendererNotice=null;
      localStorage.setItem('diplay-rtc-renderer',renderer.setMode($('renderer').value));
      media.configureVideo($('transport').value,Number($('recovery').value));
      $('displayPanel').hidden = true; $('menuButton').focus(); await status();
    } catch (error) { $('manualDisplay').open=true; $('displayError').textContent = error.message; }
  });
  $('displayForm').addEventListener('invalid',()=>{ $('manualDisplay').open=true; },true);
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
  else if(pairingCode)pair(pairingCode);
})();
