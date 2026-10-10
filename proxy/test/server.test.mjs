import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createGateway,createForwardProxy } from '../server.mjs';

const listen = server => new Promise(resolve => server.listen(0,'127.0.0.1',() => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
function request(port,path,headers = {},body) {
  return new Promise((resolve,reject) => {
    const request = http.request({host:'127.0.0.1',port,path,method:body ? 'POST' : 'GET',headers},response => {
      let text = ''; response.setEncoding('utf8'); response.on('data',chunk => { text += chunk; });
      response.on('end',() => resolve({status:response.statusCode,text}));
    });
    request.on('error',reject); request.end(body);
  });
}
test('gateway keeps upstream fixed, preserves pairing authorization and forwards controls',async () => {
  const upstream = http.createServer((request,response) => {
    let body = ''; request.on('data',chunk => { body += chunk; });
    request.on('end',() => response.end(JSON.stringify({url:request.url,auth:request.headers.authorization,origin:request.headers.origin,body})));
  });
  const upstreamPort = await listen(upstream);
  const gateway = createGateway(`http://127.0.0.1:${upstreamPort}`);
  const port = await listen(gateway);
  try {
    const response = await request(port,'/api/touch?test=1', {Authorization:'Bearer pairing',Origin:`http://127.0.0.1:${port}`},'{"contacts":[]}');
    const received = JSON.parse(response.text);
    assert.equal(received.url,'/api/touch?test=1'); assert.equal(received.auth,'Bearer pairing');
    assert.equal(received.origin,`http://127.0.0.1:${upstreamPort}`); assert.equal(received.body,'{"contacts":[]}');
    assert.equal((await request(port,'//other-host/api/status')).status,400);
    assert.equal((await request(port,'http://other-host/api/status')).status,400);
    assert.equal((await request(port,'/api/status',{Host:'bad/host'})).status,400);
    assert.equal((await request(port,'/api/status',{Host:'user@host'})).status,400);
    const foreign = JSON.parse((await request(port,'/api/touch',{Origin:'https://foreign.example'})).text);
    assert.equal(foreign.origin,'https://foreign.example');
  } finally { await close(gateway); await close(upstream); }
});
test('forward proxy is authenticated and restricts destinations to web ports',async () => {
  assert.throws(() => createForwardProxy('short'));
  const proxy = createForwardProxy('long-local-test-token-for-proxy');
  const port = await listen(proxy);
  try {
    assert.equal((await request(port,'http://example.invalid')).status,407);
    assert.equal((await request(port,'http://example.invalid:22',{'Proxy-Authorization':'Bearer long-local-test-token-for-proxy'})).status,400);
    assert.equal((await request(port,'file:///etc/hosts',{'Proxy-Authorization':'Bearer long-local-test-token-for-proxy'})).status,400);
  } finally { await close(proxy); }
});
test('gateway fails clearly when the independently deployed host is down',async () => {
  const gone = http.createServer(); const missingPort = await listen(gone); await close(gone);
  const gateway = createGateway(`http://127.0.0.1:${missingPort}`); const port = await listen(gateway);
  try { assert.equal((await request(port,'/api/status')).status,502); }
  finally { await close(gateway); }
});
