// Frame callbacks report submission to the compositor, not physical screen pixels.
export function createVideoPresentation({video,now=()=>performance.now(),isVisible=()=>!globalThis.document?.hidden}) {
  let source=null, generation=0, pending=null, requestedAt=-Infinity, observed=null, baseline=null;
  let callbackAt=null, fps=null, failure=null, disposed=false;
  const supported=typeof video.requestVideoFrameCallback==='function' &&
    typeof video.cancelVideoFrameCallback==='function';
  function cancel() {
    generation++;
    if(!pending)return;
    const old=pending;pending=null;
    try {video.cancelVideoFrameCallback(old.id);}
    catch(error) {
      failure='frame-callback-cancel-failed';
      console.warn('DiPlay video diagnostics: '+failure,error);
    }
  }
  function reset() {
    cancel();source=video.srcObject;requestedAt=-Infinity;observed=null;baseline=null;callbackAt=null;fps=null;
  }
  function sample(active) {
    if(source!==video.srcObject)reset();
    const at=now(),visible=isVisible();
    const measuring=!disposed && active && visible && !video.hidden && !video.paused && Boolean(source) && source.active!==false;
    if(!measuring) {cancel();fps=null;baseline=null;}
    else if(supported && !failure && !pending && at-requestedAt>=1000) {
      const request={id:null,at,source,generation};pending=request;requestedAt=at;
      try {
        request.id=video.requestVideoFrameCallback((_,metadata)=>{
          if(disposed || pending!==request || request.generation!==generation || video.srcObject!==request.source)return;
          pending=null;
          if(!isVisible() || video.hidden || video.paused)return;
          const count=Number.isSafeInteger(metadata?.presentedFrames) && metadata.presentedFrames>=0?metadata.presentedFrames:null;
          const submittedAt=Number.isFinite(metadata?.presentationTime)?metadata.presentationTime:null;
          const time=submittedAt??now();
          fps=baseline && count!==null && baseline.count!==null && count>=baseline.count && time>baseline.time?
            (count-baseline.count)*1000/(time-baseline.time):null;
          observed={count,time,submittedAt,mediaTime:Number.isFinite(metadata?.mediaTime)?metadata.mediaTime:null};
          baseline=observed;
          callbackAt=now();
          // The next callback is requested by a later sample, never from this callback.
        });
      } catch(error) {
        pending=null;failure='frame-callback-request-failed';
        console.warn('DiPlay video diagnostics: '+failure,error);
      }
    }
    return {supported:supported && !failure,error:failure,
      presentedFrames:observed?.count??null,
      presentedFps:measuring && callbackAt!==null && at-callbackAt<=2000 &&
        (observed.submittedAt===null || at-observed.submittedAt<=2000)?fps:null,
      submittedFrameAgeMs:observed?.submittedAt==null?null:Math.max(0,at-observed.submittedAt),
      callbackAgeMs:callbackAt===null?null:Math.max(0,at-callbackAt),
      callbackPendingMs:pending?Math.max(0,at-pending.at):null,
      frameMediaTime:observed?.mediaTime??null,
      paused:Boolean(video.paused),readyState:video.readyState,currentTime:video.currentTime,
      elementHidden:Boolean(video.hidden),pageVisible:visible,
      streamActive:source?(typeof source.active==='boolean'?source.active:null):false};
  }
  return {sample,reset,dispose(){disposed=true;reset();}};
}
