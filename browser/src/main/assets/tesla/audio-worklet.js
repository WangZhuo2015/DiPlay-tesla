import {decodeAudioPacket} from './audio-packet.js';

const TAPS=32, PHASES=512;
// Prepared on the network worker, not during an audio render quantum.
export function resamplingKernel(inputRate,outputRate) {
  if(inputRate===outputRate)return null;
  const table=new Float32Array(TAPS*PHASES), cutoff=Math.min(1,outputRate/inputRate)*.94;
  for(let phase=0;phase<PHASES;phase++) {
    let sum=0;
    for(let tap=0;tap<TAPS;tap++) {
      const x=tap-TAPS/2+1-phase/PHASES, angle=Math.PI*x*cutoff;
      const window=Math.abs(x)<TAPS/2?.42+.5*Math.cos(Math.PI*x/(TAPS/2))+.08*Math.cos(2*Math.PI*x/(TAPS/2)):0;
      const value=(Math.abs(angle)<1e-10?1:Math.sin(angle)/angle)*cutoff*window;
      table[phase*TAPS+tap]=value;sum+=value;
    }
    for(let tap=0;tap<TAPS;tap++)table[phase*TAPS+tap]/=sum;
  }
  return table;
}

// One fixed ring per live stream; packet boundaries do not reset the resampling phase.
export class PcmPlayback {
  constructor(rate) {
    this.rate=rate; this.bufferMs=200; this.frame=0; this.streams=new Map();
    this.underruns=0; this.overruns=0; this.byRole={music:0,navigation:0,legacy:0};
    this.closed=false;
  }
  clear(id) {
    if (id === undefined) this.streams.clear(); else this.streams.delete(id);
  }
  receive(buffer,kernel=null) {
    const packet=decodeAudioPacket(buffer);
    if (!packet || packet.pcm.length/packet.channels/packet.rate>.5) return 'invalid-packet';
    let stream=this.streams.get(packet.stream);
    if (!stream || stream.rate!==packet.rate || stream.channels!==packet.channels || stream.role!==packet.role) {
      if (!stream && this.streams.size>=8) {
        for (const [id,old] of this.streams) if (!old.count) this.streams.delete(id);
        if (this.streams.size>=8) return 'stream-limit';
      }
      stream={rate:packet.rate,channels:packet.channels,role:packet.role,
        capacity:Math.ceil(packet.rate*.8)+TAPS+2,head:0,count:0,phase:0,skip:0,starved:false,played:false,
        start:this.frame+Math.ceil(this.bufferMs*this.rate/1000),fade:0,last:[0,0]};
      stream.kernel=kernel||resamplingKernel(packet.rate,this.rate);
      stream.data=new Float32Array(stream.capacity*stream.channels);
      this.streams.set(packet.stream,stream);
    }
    const frames=packet.pcm.length/packet.channels;
    const budget=Math.ceil(packet.rate*Math.max(.75,this.bufferMs/1000+.4));
    if (stream.count+frames>budget) {
      this.overruns++; stream.head=0; stream.count=0; stream.phase=0;stream.skip=0;
      stream.data.fill(0,(stream.capacity-TAPS)*stream.channels);
      stream.start=this.frame+Math.ceil(Math.min(20,this.bufferMs)*this.rate/1000);
      stream.starved=false; stream.fade=0;
    } else if (stream.starved) {
      this.underruns++;
      this.byRole[stream.role===1?'music':stream.role===2?'navigation':'legacy']++;
      stream.starved=false; stream.phase=0; stream.skip=0;stream.fade=0;
      // A genuine gap cannot be reconstructed. Resume with a short prefill, not another full delay.
      stream.start=this.frame+Math.ceil(Math.min(20,this.bufferMs)*this.rate/1000);
    }
    let write=((stream.head+stream.count)%stream.capacity)*stream.channels;
    for (let i=0;i<packet.pcm.length;i++) {
      stream.data[write++]=packet.pcm[i]/32768;
      if(write===stream.data.length)write=0;
    }
    stream.count+=frames;
    const skipped=Math.min(stream.skip,stream.count);
    stream.head=(stream.head+skipped)%stream.capacity;stream.count-=skipped;stream.skip-=skipped;
    return null;
  }
  process(outputs) {
    const size=outputs[0][0].length, fadeFrames=Math.max(1,Math.round(this.rate*.005));
    for (const stream of this.streams.values()) {
      const output=outputs[stream.role===1?0:stream.role===2?1:2], step=stream.rate/this.rate;
      for (let i=0;i<size;i++) {
        if (this.frame+i<stream.start) continue;
        if (!stream.count) {
          if (!stream.played) continue;
          stream.starved=true;
          if (stream.fade>0) {
            stream.fade=Math.max(0,stream.fade-1/fadeFrames);
            for (let c=0;c<2;c++) output[c][i]+=stream.last[c]*stream.fade;
          }
          continue;
        }
        stream.played=true; stream.fade=Math.min(1,stream.fade+1/fadeFrames);
        let left=0,right=0;
        if(!stream.kernel) {
          const slot=stream.head*stream.channels;
          left=stream.data[slot];right=stream.channels===1?left:stream.data[slot+1];
        } else {
          const phase=Math.min(PHASES-1,Math.floor(stream.phase*PHASES))*TAPS;
          let slot=stream.head-TAPS/2+1;
          if(slot<0)slot+=stream.capacity;
          slot*=stream.channels;
          const taps=Math.min(TAPS,stream.count+TAPS/2-1);
          if(stream.channels===1) {
            for(let tap=0;tap<taps;tap++) {
              left+=stream.data[slot++]*stream.kernel[phase+tap];
              if(slot===stream.data.length)slot=0;
            }
            right=left;
          } else {
            for(let tap=0;tap<taps;tap++) {
              const weight=stream.kernel[phase+tap];
              left+=stream.data[slot]*weight;right+=stream.data[slot+1]*weight;
              slot+=2;if(slot===stream.data.length)slot=0;
            }
          }
        }
        stream.last[0]=left;stream.last[1]=right;
        output[0][i]+=left*stream.fade;output[1][i]+=right*stream.fade;
        stream.phase+=step;
        const consumed=Math.floor(stream.phase);
        stream.phase-=consumed;
        stream.skip=Math.max(0,consumed-stream.count);
        stream.head+=Math.min(consumed,stream.count);
        if(stream.head>=stream.capacity)stream.head-=stream.capacity;
        stream.count=Math.max(0,stream.count-consumed);
      }
    }
    this.frame+=size;
    return !this.closed;
  }
  stats() {
    let queuedMs=0, musicQueuedMs=0, navigationQueuedMs=0;
    for (const stream of this.streams.values()) {
      const queued=stream.count*1000/stream.rate;
      queuedMs=Math.max(queuedMs,queued);
      if (stream.role===1) musicQueuedMs=Math.max(musicQueuedMs,queued);
      if (stream.role===2) navigationQueuedMs=Math.max(navigationQueuedMs,queued);
    }
    return {queuedMs,musicQueuedMs,navigationQueuedMs,underruns:this.underruns,
      musicUnderruns:this.byRole.music,navigationUnderruns:this.byRole.navigation,overruns:this.overruns};
  }
}

if (typeof registerProcessor==='function') {
  class DiPlayAudioProcessor extends AudioWorkletProcessor {
    constructor() {
      super(); this.playback=new PcmPlayback(sampleRate); this.nextReport=0;
      this.port.onmessage=event=>{
        const data=event.data;
        if (data.type==='pcm') {
          const reason=this.playback.receive(data.buffer,data.kernel);
          if (reason) this.port.postMessage({type:'error',reason});
        } else if (data.type==='buffer') {
          this.playback.bufferMs=data.ms; this.playback.clear();
        } else if (data.type==='stop') this.playback.clear(data.stream);
        else if (data.type==='close') { this.playback.clear(); this.playback.closed=true; }
      };
    }
    process(inputs,outputs) {
      const active=this.playback.process(outputs);
      if (this.playback.frame>=this.nextReport) {
        this.nextReport=this.playback.frame+Math.round(sampleRate/2);
        this.port.postMessage({type:'stats',...this.playback.stats()});
      }
      return active;
    }
  }
  registerProcessor('diplay-pcm',DiPlayAudioProcessor);
}
