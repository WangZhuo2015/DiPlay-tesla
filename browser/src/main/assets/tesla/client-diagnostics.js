const fields = new Set(('visibility focused renderer transport paused readyState currentTime elementHidden streamActive '+
  'reason errorName request httpStatus durationMs connected statusAvailable hadSocket wasDisplayed connection ice '+
  'decodedFrames decodedFps presentedFrames presentedFps callbackAgeMs callbackPendingMs submittedFrameAgeMs '+
  'sent received expiredFrames overflowFrames keyframeSkips sendFailures recovering fallbackReason '+
  'enabled contextState engine queuedMs underruns overruns rvfc browser persisted dropped '+
  'targetMs packets maxArrivalGapMs musicMaxGapMs navigationMaxGapMs musicQueuedMs navigationQueuedMs musicUnderruns navigationUnderruns').split(' '));

export function diagnosticFields(data) {
  return Object.fromEntries(Object.entries(data).filter(([key,value])=>fields.has(key) &&
    (value===null || typeof value==='boolean' ||
      typeof value==='number' && Number.isFinite(value) && Math.abs(value)<=Number.MAX_SAFE_INTEGER ||
      typeof value==='string' && /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(value))));
}

export function createClientDiagnostics({
  client,getToken,context=()=>({}),now=()=>performance.now(),wallNow=()=>Date.now(),
  send=async(body,token)=>{
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),5000);
    try {return await fetch('/api/client-diagnostics',{method:'POST',keepalive:true,cache:'no-store',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body,signal:abort.signal});}
    finally {clearTimeout(timer);}
  },
  warn=()=>console.warn('DiPlay diagnostics upload failed; retaining bounded pending events'),
}) {
  let queue=[], sequence=0, dropped=0, inFlight=null, urgent=false, lastAttempt=-Infinity, lastSample=-Infinity, warned=false;
  function record(event,data={}) {
    if(queue.length>=64){queue.shift();dropped++;}
    queue.push({seq:++sequence,atMs:wallNow(),elapsedMs:Math.round(now()),event,
      data:diagnosticFields({...context(),...data})});
  }
  async function flush(force=false) {
    const token=getToken(),at=now();
    if(inFlight){urgent ||= force;return;}
    if(!queue.length || !token || !force && at-lastAttempt<5000)return;
    lastAttempt=at;
    const batch=queue.splice(0,8), lost=dropped;dropped=0;
    const task={};inFlight=task;let delivered=false;
    try {
      const response=await send(JSON.stringify({client,events:batch,dropped:lost}),token);
      if(!response.ok)throw new Error('Diagnostic upload rejected');
      warned=false;delivered=true;
    } catch {
      queue=[...batch,...queue];
      if(queue.length>64){dropped+=queue.length-64;queue=queue.slice(-64);}
      dropped+=lost;
      if(!warned){warn();warned=true;}
    } finally {
      if(inFlight===task)inFlight=null;
      const again=urgent || force && queue.length>0;urgent=false;
      if(delivered && again)void flush(true);
    }
  }
  return {record,flush,
    sample(video,audio) {
      if(now()-lastSample>=5000) {
        lastSample=now();
        record('video-sample',video);record('audio-sample',audio);
      }
      return flush();
    },
  };
}
