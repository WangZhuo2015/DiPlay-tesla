const valid = value => Number.isInteger(value) && value >= -20 && value <= 0;

// One request in flight. Coalesce gestures; never retry an uncertain write or a stale value.
export function createNavigationVolume({save,onState=()=>{}}) {
  let confirmed = null, desired = null, busy = false, issue = null, epoch = 0, connection = 0;
  const publish = () => onState({value:desired ?? confirmed,ready:confirmed !== null,busy,issue});
  async function flush() {
    if (busy || confirmed === null || desired === confirmed) { publish(); return; }
    busy = true; publish();
    const db = desired, expectedDb = confirmed, ticket = connection;
    try {
      const result = await save({db,expectedDb});
      if (ticket !== connection) return;
      if (!valid(result.value)) throw new Error('Invalid navigation level');
      confirmed = result.value;
      if (result.conflict) { desired = confirmed; issue = 'conflict'; }
      else if (desired === db) desired = confirmed;
    } catch (_) {
      // The server may have committed a timed-out write. A fresh read is required.
      if (ticket === connection) { confirmed = desired = null; issue = 'failed'; }
    } finally {
      busy = false; epoch++; publish();
    }
    if (confirmed !== null && desired !== confirmed) void flush();
  }
  return {
    get epoch() { return epoch; },
    observe(value,readEpoch = epoch) {
      if (busy || readEpoch !== epoch) return;
      if (!valid(value)) { confirmed = desired = null; publish(); return; }
      confirmed = desired = value; publish();
    },
    set(value) {
      if (confirmed === null || !valid(value)) return;
      desired = value; issue = null; epoch++; void flush();
    },
    step(delta) {
      if (confirmed !== null && Number.isInteger(delta)) this.set(Math.max(-20,Math.min(0,(desired ?? confirmed)+delta)));
    },
    unavailable() { connection++; confirmed = desired = null; epoch++; publish(); },
  };
}
