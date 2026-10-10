// Keep a still CarPlay screen alive; only new source frames can reveal a decoder stall.
export function createRtcHealth(start) {
  let decoded=-1, sent=0, progressed=start, sourceAt=-Infinity;
  return {
    source(count,now) { if(count>sent)sourceAt=now; sent=count; },
    sample(count,now,displayed) {
      if(count>decoded){decoded=count;progressed=now;}
      return displayed ? now-progressed>5000 && now-sourceAt<2000 && sent>0 : now-start>10000;
    }
  };
}
