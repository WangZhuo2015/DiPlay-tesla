/* Optional presentation of decoded WebRTC frames, independent of CarPlay negotiation.
 * Inspired by WheelPlay's Canvas renderer (GPL-3.0); see docs/THIRD_PARTY_NOTICES.md.
 * The caller owns the stream, playback and JPEG drawing. The rtcOffscreen CSS class
 * must keep the video laid out outside the viewport, never display:none.
 */
export function createRtcRenderer({
  video, canvas, onError = () => {}, onFrame = () => {},
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id), now = () => performance.now(),
  schedule = (callback, delay) => setTimeout(callback, delay), cancelScheduled = id => clearTimeout(id),
}) {
  let mode = 'native', active = false, disposed = false, generation = 0;
  let source = null, context = null, presented = false, videoCallback = null, animationCallback = null, watchdog = null;
  let lastFrameKey = null, lastVideoCallbackAt = 0, usesVideoCallbacks = false;

  function cancel() {
    generation++;
    if (videoCallback !== null && typeof video.cancelVideoFrameCallback === 'function') {
      try { video.cancelVideoFrameCallback(videoCallback); } catch (_) { /* Late callbacks are fenced below. */ }
    }
    if (animationCallback !== null) {
      try { cancelFrame(animationCallback); } catch (_) { /* Late callbacks are fenced below. */ }
    }
    if (watchdog !== null) {
      try { cancelScheduled(watchdog); } catch (_) { /* Late callbacks are fenced below. */ }
    }
    videoCallback = animationCallback = watchdog = null;
    context = null;
    presented = false;
    lastFrameKey = null;
  }

  function showNative() {
    video.classList.toggle('rtcOffscreen', false);
    video.hidden = !active;
    // The same canvas belongs to the JPEG path when WebRTC is inactive.
    canvas.hidden = active;
  }

  function fail(error) {
    cancel();
    mode = 'native';
    showNative();
    onError(error);
  }

  function frameKey(metadata, stalled) {
    if (!stalled) {
      let frames = metadata?.presentedFrames;
      if (!(frames > 0)) {
        try { frames = video.getVideoPlaybackQuality?.().totalVideoFrames; } catch (_) { /* Optional metric. */ }
      }
      if (Number.isFinite(frames) && frames > 0) return `frame:${frames}`;
    }
    const time = metadata?.mediaTime ?? video.currentTime;
    return Number.isFinite(time) ? `time:${time}` : null;
  }

  function draw(metadata = null, stalled = false) {
    if (video.readyState < 2 || !(video.videoWidth > 0) || !(video.videoHeight > 0)) return;
    let first, resized, width, height;
    try {
      width = video.videoWidth; height = video.videoHeight;
      resized = canvas.width !== width || canvas.height !== height;
      const key = frameKey(metadata, stalled);
      if (!resized && key !== null && key === lastFrameKey) return;
      // Assigning a dimension clears and reallocates the backing store. Preserve it
      // between same-size frames and do not resample to the CSS viewport dimensions.
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      context.drawImage(video, 0, 0, width, height);
      lastFrameKey = key;
      first = !presented;
      presented = true;
      video.classList.toggle('rtcOffscreen', true);
      video.hidden = false;
      canvas.hidden = false;
    } catch (error) { fail(error); return; }
    if (first || resized) onFrame(width, height);
  }

  function restart() {
    cancel();
    source = video.srcObject;
    showNative();
    if (!active || disposed || mode !== 'canvas') return;
    const ticket = generation, stream = source;
    const current = () => !disposed && active && mode === 'canvas' &&
      ticket === generation && stream === video.srcObject;
    try {
      context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Canvas 2D is unavailable');
      lastVideoCallbackAt = now();
      usesVideoCallbacks = typeof video.requestVideoFrameCallback === 'function';
      const observe = (_, metadata) => {
        if (!current()) return;
        videoCallback = null;
        lastVideoCallbackAt = now();
        if (animationCallback !== null) {
          try { cancelFrame(animationCallback); } catch (_) { /* The callback identity is fenced below. */ }
          animationCallback = null;
        }
        draw(metadata);
        if (current()) {
          scheduleVideo();
          scheduleRefresh();
        }
      };
      const scheduleVideo = () => {
        if (!usesVideoCallbacks) return;
        try { videoCallback = video.requestVideoFrameCallback(observe); }
        catch (_) { usesVideoCallbacks = false; videoCallback = null; }
      };
      const refresh = () => {
        if (!current()) return;
        // Some embedded compositors stop video callbacks while decoding continues.
        // Use media time once they stall: their presented-frame counter can freeze too.
        if (!usesVideoCallbacks) draw();
        else if (now() - lastVideoCallbackAt >= 250) draw(null, true);
        if (current()) scheduleRefresh();
      };
      const scheduleRefresh = () => {
        if (!current()) return;
        try {
          const remaining = 250 - (now() - lastVideoCallbackAt);
          if (usesVideoCallbacks && remaining > 0) {
            // Healthy frame callbacks already provide presentation pacing. Check their
            // deadline without waking JavaScript at the display's refresh rate as well.
            if (watchdog === null) {
              const id = schedule(() => {
                if (!current() || watchdog !== id) return;
                watchdog = null;
                refresh();
              }, remaining);
              watchdog = id;
            }
          } else {
            if (watchdog !== null) { cancelScheduled(watchdog); watchdog = null; }
            if (animationCallback === null) {
              const id = requestFrame(() => {
                if (!current() || animationCallback !== id) return;
                animationCallback = null;
                refresh();
              });
              animationCallback = id;
            }
          }
        } catch (error) { fail(error); }
      };
      draw();
      if (!current()) return;
      scheduleVideo();
      scheduleRefresh();
    } catch (error) { if (current()) fail(error); }
  }

  function setActive(value) {
    if (disposed) return;
    value = Boolean(value);
    if (active === value && source === video.srcObject) return;
    active = value;
    restart();
  }

  return {
    setMode(value) {
      if (disposed) return mode;
      const selected = value === 'canvas' ? 'canvas' : 'native';
      if (mode !== selected) { mode = selected; restart(); }
      return mode;
    },
    setActive,
    stop() { setActive(false); },
    dispose() {
      if (disposed) return;
      active = false; disposed = true;
      cancel(); showNative(); source = null;
    },
    get mode() { return mode; },
    // Use this element's rectangle for touch mapping; Canvas retains video source dimensions.
    get surface() { return active && !presented ? video : canvas; },
  };
}
