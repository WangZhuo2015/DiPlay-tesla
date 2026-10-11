/* Keep press/release boundaries; only intermediate motion may be replaced. */
export function createTouchSender({send,onError=()=>{},clock=Date.now}) {
  const queue=[];
  let sending=false,lastSent=0;
  async function drain() {
    if(sending)return;
    sending=true;
    try {
      while(queue.length) {
        await send(queue.shift().contacts);
        lastSent=clock();
      }
    } catch(error) {
      queue.length=0;
      onError(error);
      // Cancel a possibly delivered press. The host watchdog is the final fallback.
      try {await send([]);} catch(_) {}
    } finally {sending=false;if(queue.length)drain();}
  }
  function enqueue(contacts,motion=false) {
    const snapshot=contacts.map(contact=>({...contact})).sort((a,b)=>a.id-b.id);
    const last=queue[queue.length-1];
    if(motion && last?.motion)last.contacts=snapshot;
    else queue.push({contacts:snapshot,motion});
    drain();
  }
  return {transition:contacts=>enqueue(contacts),motion:contacts=>enqueue(contacts,true),
    cancel(){queue.length=0;enqueue([]);},
    heartbeat(contacts){if(contacts.length && !sending && !queue.length && clock()-lastSent>300)enqueue(contacts,true);}};
}
