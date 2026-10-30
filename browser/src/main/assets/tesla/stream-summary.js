export function streamSummary({transport,width,height,fps,device},labels) {
  const parts=[transport];
  if(width>0 && height>0)parts.push(`${width} × ${height}`);
  else if(labels.unknown)parts.push(labels.unknown);
  if(Number.isFinite(fps) && fps>=0)parts.push(`${fps.toFixed(1)} fps`);
  else if(labels.unknown)parts.push(`fps: ${labels.unknown}`);
  const fresh=device && device.ageMs>=0 && device.ageMs<=6000;
  const soc=device?.thermalSensors?.find(sensor=>/(^|[-_])soc([-_]|$)/i.test(sensor.name));
  if(soc)parts.push(`SoC ${fresh && Number.isFinite(soc.celsius)?soc.celsius.toFixed(1)+' °C':labels.stale}`);
  return parts;
}

// Count only successfully decoded/drawn JPEGs; configured frame rate is not a measurement.
export function createJpegMetrics(now = () => performance.now()) {
  let width=0,height=0,count=0,started=now(),activeAt=null,fps=null;
  return {
    reset() { width=height=count=0; started=now();activeAt=null;fps=null; },
    activity() { activeAt=now(); },
    frame(w,h) {
      if(!width)started=now();
      width=w;height=h;count++;activeAt=now();
    },
    sample() {
      const at=now();
      if(activeAt===null || at-activeAt>6000 || !width)return {width:0,height:0,fps:null};
      if(at-started>=1000) { fps=count*1000/(at-started);count=0;started=at; }
      return {width,height,fps};
    },
  };
}
