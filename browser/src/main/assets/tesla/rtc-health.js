// Recovery policy inspired by WheelPlay 4ed353682299 (GPL-3.0). Buffering stays independent.
export function createRtcHealth(start, graceMs = 10000) {
  const grace = [4000, 10000, 30000].includes(graceMs) ? graceMs : 10000;
  let decoded = -1, sent = 0, sentAtProgress = 0, sourceAt = null, stalledSince = null;
  let disconnectedSince = null, statsFailedSince = null;
  const sourceActive = now => sent > sentAtProgress && sourceAt !== null && now - sourceAt < 2000;
  const timedOut = (since, now) => since !== null && now - since >= grace;
  function failureReason(now, displayed) {
    if (!displayed && now - start >= Math.max(10000, grace)) return 'first-frame-timeout';
    if (timedOut(disconnectedSince, now)) return 'disconnected-timeout';
    if (timedOut(statsFailedSince, now)) return 'stats-timeout';
    if (displayed && sourceActive(now) && timedOut(stalledSince, now)) return 'decoder-stall';
    return null;
  }
  const expired = (now, displayed) => failureReason(now, displayed) !== null;
  return {
    graceMs: grace,
    source(count, now) {
      if (count < sent) { stalledSince = null; sentAtProgress = count; sourceAt = null; }
      if (count > sent) {
        if (sourceAt === null || now - sourceAt >= 2000 || sent === sentAtProgress) stalledSince = now;
        sourceAt = now;
      }
      sent = count;
    },
    sample(count, now, displayed) {
      if (count !== decoded) { decoded = count; stalledSince = null; sentAtProgress = sent; }
      if (!sourceActive(now)) stalledSince = null;
      return expired(now, displayed);
    },
    disconnected(now) { if (disconnectedSince === null) disconnectedSince = now; },
    connected(now) {
      disconnectedSince = null; stalledSince = null; sourceAt = null; sentAtProgress = sent;
    },
    statsFailed(now) { if (statsFailedSince === null) statsFailedSince = now; },
    statsRecovered() { statsFailedSince = null; },
    recovering(now) {
      return disconnectedSince !== null || statsFailedSince !== null ||
        (sourceActive(now) && stalledSince !== null && now - stalledSince >= 2000);
    },
    expired,
    failureReason,
  };
}
