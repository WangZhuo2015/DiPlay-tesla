let workerUnavailable=false;

export class WorkerMediaSocket {
  constructor(url,createWorker=()=>new Worker(new URL('./media-worker.js',import.meta.url),{type:'module'}),failed=()=>{}) {
    this.readyState=0;this.worker=createWorker();this.audioEpoch=0;
    const startup=setTimeout(()=>{
      if(this.readyState===3)return;
      failed();this.onerror?.({reason:'worker-start-timeout'});this.finish();
    },4000);
    this.cancelStartup=()=>clearTimeout(startup);
    this.worker.onmessage=event=>{
      if(this.readyState===3)return;
      const message=event.data;
      if(message.type==='worker-ready')this.cancelStartup();
      else if(message.type==='open') {this.cancelStartup();this.readyState=1;this.onopen?.();}
      else if(message.type==='message')this.onmessage?.({data:message.data});
      else if(message.type==='audio-stats' && message.epoch===this.audioEpoch)this.onaudiostats?.(message.stats);
      else if(message.type==='audio-error' && message.epoch===this.audioEpoch)this.onaudioerror?.(message.reason);
      else if(message.type==='close')this.finish();
      else if(message.type==='error') {
        if(message.reason==='worker-command-failed')failed();
        this.onerror?.({reason:message.reason});
      }
    };
    this.worker.onerror=()=>{
      if(this.readyState===3)return;
      failed();this.onerror?.({reason:'worker-unavailable'});this.finish();
    };
    this.worker.onmessageerror=this.worker.onerror;
    try {this.worker.postMessage({type:'open',url});}
    catch(error) {this.cancelStartup();this.worker.terminate();this.readyState=3;throw error;}
  }
  send(data) {
    if(this.readyState!==1)throw new Error('Media socket is not open');
    this.worker.postMessage({type:'send',data});
  }
  bindAudio(port,options) {
    const epoch=++this.audioEpoch;
    this.worker.postMessage({type:'audio-port',port,epoch,...options},[port]);
  }
  unbindAudio() {
    this.audioEpoch++;
    if(this.readyState!==3)this.worker.postMessage({type:'audio-detach'});
  }
  audioBuffer(ms) {this.worker.postMessage({type:'audio-buffer',ms});}
  stopAudio(stream) {this.worker.postMessage({type:'audio-stop',stream});}
  finish() {
    if(this.readyState===3)return;
    this.readyState=3;this.cancelStartup();this.worker.terminate();this.onclose?.();
  }
  close() {
    if(this.readyState===3)return;
    // terminate() closes the worker-owned socket even if its message queue is blocked.
    this.finish();
  }
}

export function createMediaSocket(url) {
  if(typeof Worker!=='function' || workerUnavailable)return new WebSocket(url);
  const failed=()=>{
    workerUnavailable=true;
    console.warn('DiPlay media: Worker unavailable; using compatibility transport');
  };
  try {return new WorkerMediaSocket(url,undefined,failed);}
  catch {failed();return new WebSocket(url);}
}
