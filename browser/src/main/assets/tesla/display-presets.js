/* Presets use the browser viewport, not a guessed vehicle panel resolution. */
export function displayPreset(kind, width, height, density = 1) {
  if (![width, height, density].every(Number.isFinite) || width <= 0 || height <= 0 || density <= 0) return null;
  const options = {
    fit: {width:1920,height:1080,fps:20,jpegQuality:80,upscale:false},
    light: {width:1280,height:720,fps:15,jpegQuality:70,upscale:false},
    clear: {width:1920,height:1080,fps:20,jpegQuality:85,upscale:true}
  }[kind];
  if (!options) return null;
  const pixels = Math.min(density, 2);
  const scale = Math.min(options.upscale ? Infinity : pixels, options.width / width, options.height / height);
  const size = {width:Math.floor(width * scale / 2) * 2,height:Math.floor(height * scale / 2) * 2};
  if (size.width < 320 || size.height < 240) return null;
  return {...size,fps:options.fps,jpegQuality:options.jpegQuality};
}
