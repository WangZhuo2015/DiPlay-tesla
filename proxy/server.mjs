import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const hopHeaders = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
function cleanHeaders(headers) {
  const excluded = new Set([...hopHeaders,...String(headers.connection || '').toLowerCase().split(',').map(part => part.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !excluded.has(name.toLowerCase())));
}

/** Fixed upstream only: this optional gateway cannot be used as an arbitrary public relay. */
export function createGateway(upstreamText) {
  const upstream = new URL(upstreamText);
  if (!['http:','https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) {
    throw new Error('DIPLAY_UPSTREAM must be an http(s) origin, without credentials or a path');
  }
  const gateway = http.createServer((request,response) => {
    if (!request.url?.startsWith('/') || request.url.startsWith('//')) { response.writeHead(400).end(); return; }
    const destination = new URL(upstream.origin);
    // Assigning the path avoids URL resolution turning //host into a different upstream.
    const question = request.url.indexOf('?');
    destination.pathname = question < 0 ? request.url : request.url.slice(0,question);
    destination.search = question < 0 ? '' : request.url.slice(question);
    const headers = cleanHeaders(request.headers);
    const incomingHost = request.headers.host;
    headers.host = upstream.host;
    if (headers.origin === `http://${incomingHost}` || headers.origin === `https://${incomingHost}`) headers.origin = upstream.origin;
    const transport = upstream.protocol === 'https:' ? https : http;
    const outgoing = transport.request(destination,{method:request.method,headers,timeout:10000},received => {
      response.writeHead(received.statusCode || 502,cleanHeaders(received.headers));
      received.on('error',() => response.destroy());
      received.pipe(response);
    });
    outgoing.on('timeout',() => outgoing.destroy(new Error('Upstream timeout')));
    outgoing.on('error',() => { if (!response.headersSent) response.writeHead(502).end('DiPlay host unavailable'); else response.destroy(); });
    request.on('aborted',() => outgoing.destroy());
    response.on('close',() => outgoing.destroy());
    request.pipe(outgoing);
  });
  gateway.headersTimeout = 10000;
  gateway.requestTimeout = 15000;
  return gateway;
}

/** Optional authenticated forward proxy, explicitly configured by its clients (not a hotspot/router). */
export function createForwardProxy(secret) {
  if (!secret || secret.length < 24) throw new Error('DIPLAY_PROXY_TOKEN must contain at least 24 characters');
  const expected = Buffer.from(`Bearer ${secret}`);
  function authorized(request) {
    const supplied = Buffer.from(String(request.headers['proxy-authorization'] || ''));
    return supplied.length === expected.length && timingSafeEqual(supplied,expected);
  }
  function destination(text) {
    const url = new URL(text);
    if (url.username || url.password || !['http:','https:'].includes(url.protocol)) throw new Error('Invalid destination');
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    if (![80,443].includes(port)) throw new Error('Only web ports 80/443 are allowed');
    return url;
  }
  const proxy = http.createServer((request,response) => {
    if (!authorized(request)) { response.writeHead(407,{'Proxy-Authenticate':'Bearer realm="DiPlay"'}).end(); return; }
    let url;
    try { url = destination(request.url); } catch (_) { response.writeHead(400).end(); return; }
    const headers = cleanHeaders(request.headers); headers.host = url.host;
    const outgoing = (url.protocol === 'https:' ? https : http).request(url,{method:request.method,headers,timeout:10000},received => {
      response.writeHead(received.statusCode || 502,cleanHeaders(received.headers)); received.pipe(response);
      received.on('error',() => response.destroy());
    });
    outgoing.on('timeout',() => outgoing.destroy());
    outgoing.on('error',() => { if (!response.headersSent) response.writeHead(502).end(); else response.destroy(); });
    request.on('aborted',() => outgoing.destroy()); response.on('close',() => outgoing.destroy()); request.pipe(outgoing);
  });
  const tunnels = new Set();
  proxy.on('connect',(request,client,head) => {
    if (!authorized(request)) { client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Bearer realm="DiPlay"\r\n\r\n'); return; }
    let url;
    try { url = destination(`https://${request.url}`); if (Number(url.port || 443) !== 443 || url.pathname !== '/' || url.search || url.hash) throw new Error(); }
    catch (_) { client.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
    const upstream = net.connect({host:url.hostname.replace(/^\[|\]$/g,''),port:443});
    tunnels.add(client); tunnels.add(upstream);
    client.setTimeout(60000); upstream.setTimeout(60000);
    const destroy = () => { client.destroy(); upstream.destroy(); tunnels.delete(client); tunnels.delete(upstream); };
    client.on('error',destroy); upstream.on('error',destroy); client.on('close',destroy); upstream.on('close',destroy);
    client.on('timeout',destroy); upstream.on('timeout',destroy);
    upstream.once('connect',() => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); client.pipe(upstream); upstream.pipe(client); });
  });
  const originalClose = proxy.close.bind(proxy);
  proxy.close = callback => { for (const socket of tunnels) socket.destroy(); return originalClose(callback); };
  proxy.headersTimeout = 10000; proxy.requestTimeout = 15000;
  return proxy;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bind = process.env.DIPLAY_BIND || '127.0.0.1';
  const servers = [];
  if (process.env.DIPLAY_UPSTREAM) {
    const server = createGateway(process.env.DIPLAY_UPSTREAM);
    server.listen(Number(process.env.DIPLAY_PORT || 8090),bind,() => console.log(`DiPlay gateway: ${bind}:${server.address().port}`));
    servers.push(server);
  }
  if (process.env.DIPLAY_FORWARD_PORT) {
    const server = createForwardProxy(process.env.DIPLAY_PROXY_TOKEN);
    server.listen(Number(process.env.DIPLAY_FORWARD_PORT),bind,() => console.log(`DiPlay forward proxy: ${bind}:${server.address().port}`));
    servers.push(server);
  }
  if (!servers.length) throw new Error('Set DIPLAY_UPSTREAM and/or DIPLAY_FORWARD_PORT; no proxy is started by default');
  servers.forEach(server => server.on('error',error => { console.error(error.message); process.exitCode = 1; }));
  const close = () => servers.forEach(server => server.close());
  process.on('SIGINT',close); process.on('SIGTERM',close);
}
