export function streamSummary({transport,width,height,fps,device},labels) {
  const parts=[transport];
  if(width>0 && height>0)parts.push(`${width} × ${height}`);
  if(Number.isFinite(fps))parts.push(`${fps.toFixed(1)} fps`);
  const fresh=device && device.ageMs>=0 && device.ageMs<=6000;
  const soc=device?.thermalSensors?.find(sensor=>/(^|[-_])soc([-_]|$)/i.test(sensor.name));
  if(soc)parts.push(`SoC ${fresh && Number.isFinite(soc.celsius)?soc.celsius.toFixed(1)+' °C':labels.stale}`);
  return parts;
}
