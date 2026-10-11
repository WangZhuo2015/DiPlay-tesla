/* Presets use the browser viewport, not a guessed vehicle panel resolution. */
export function displayPreset(kind, width, height, density = 1, fitScale = 1) {
  if (![width, height, density, fitScale].every(Number.isFinite) || width <= 0 || height <= 0 || density <= 0 || fitScale <= 0 || fitScale > 1) return null;
  const options = {
    fit: {width:1920,height:1080,fps:20,jpegQuality:80,upscale:false},
    light: {width:1280,height:720,fps:15,jpegQuality:70,upscale:false},
    clear: {width:1920,height:1080,fps:20,jpegQuality:85,upscale:true},
    qhd: {width:2560,height:1440,fps:20,jpegQuality:85,upscale:true}
  }[kind];
  if (!options) return null;
  const pixels = Math.min(density, 2);
  const scale = Math.min(options.upscale ? Infinity : pixels, options.width / width, options.height / height);
  const size = {width:Math.floor(width * scale / 2) * 2,height:Math.floor(height * scale / 2) * 2};
  if (size.width < 320 || size.height < 240) return null;
  // Scale the capped output, so high DPR cannot cancel a driver's 1/2 choice.
  // Very small windows stop at the encoder's minimum rather than saving invalid sizes.
  if (kind === 'fit') {
    const reduced = Math.max(fitScale, 320 / size.width, 240 / size.height);
    size.width = Math.max(320, Math.floor(size.width * reduced / 2) * 2);
    size.height = Math.max(240, Math.floor(size.height * reduced / 2) * 2);
  }
  return {...size,fps:options.fps,jpegQuality:options.jpegQuality};
}
