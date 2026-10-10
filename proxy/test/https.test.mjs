import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import tlsSocket from 'node:tls';
import {createHash} from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync,readFileSync,unlinkSync,rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGateway,loadGatewayTls } from '../server.mjs';

const listen = server => new Promise(resolve => server.listen(0,'127.0.0.1',() => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
function request(port,path,options = {}) {
  return new Promise((resolve,reject) => {
    const outgoing = https.get({host:'127.0.0.1',servername:'localhost',port,path,...options},response => {
      const chunks = [];
      response.on('data',chunk => chunks.push(chunk));
      response.on('end',() => resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));
    });
    outgoing.on('error',reject);
  });
}

test('HTTPS preserves pairing, origin and frame bytes; untrusted clients reject the certificate',async t => {
  const directory = mkdtempSync(join(tmpdir(),'diplay-tls-test-'));
  const keyPath = join(directory,'key.pem'), certPath = join(directory,'cert.pem');
  t.after(() => {
    for (const path of [keyPath,certPath]) {
      try { unlinkSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    rmdirSync(directory);
  });
  // Only ephemeral test identities are generated; no private key fixtures are stored in source.
  execFileSync(process.env.DIPLAY_TEST_OPENSSL || 'openssl',[
    'req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost',
    '-addext','subjectAltName=DNS:localhost','-keyout',keyPath,'-out',certPath,
  ],{stdio:'ignore'});
  const ca = readFileSync(certPath);
  const seen = [];
  const frame = Buffer.from([0xff,0xd8,1,2,3,0xff,0xd9]);
  const upstream = http.createServer((request,response) => {
    seen.push({url:request.url,authorization:request.headers.authorization,origin:request.headers.origin});
    response.writeHead(200,{'Content-Type':'image/jpeg','X-Frame-Sequence':'9'}).end(frame);
  });
  const upstreamPort = await listen(upstream);
  upstream.on('upgrade',(request,socket,head)=>{
    seen.push({url:request.url,origin:request.headers.origin});
    const accept=createHash('sha1').update(request.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    if(head.length)socket.write(head);
    socket.pipe(socket);
  });
  const tls = loadGatewayTls({DIPLAY_TLS_CERT:certPath,DIPLAY_TLS_KEY:keyPath});
  const gateway = createGateway(`http://127.0.0.1:${upstreamPort}`,tls);
  const port = await listen(gateway);
  try {
    const received = await request(port,'/api/frame?after=5',{
      ca,headers:{Authorization:'Bearer local-test-pairing',Origin:`https://127.0.0.1:${port}`},
    });
    assert.equal(received.status,200);
    assert.deepEqual(received.body,frame);
    assert.equal(received.headers['x-frame-sequence'],'9');
    assert.deepEqual(seen[0],{url:'/api/frame?after=5',authorization:'Bearer local-test-pairing',origin:`http://127.0.0.1:${upstreamPort}`});
    await request(port,'/api/status',{ca,headers:{Origin:`http://127.0.0.1:${port}`}});
    assert.equal(seen[1].origin,`http://127.0.0.1:${port}`);
    await assert.rejects(request(port,'/api/status'),{code:'DEPTH_ZERO_SELF_SIGNED_CERT'});
    await assert.rejects(new Promise((resolve,reject) => {
      const outgoing = http.get({host:'127.0.0.1',port,path:'/'},resolve);
      outgoing.on('error',reject);
    }),{code:'ECONNRESET'});
    assert.equal(seen.length,2,'failed TLS requests must never reach the HTTP upstream');
    async function upgrade(origin,path='/api/media') {
      return new Promise((resolve,reject)=>{
        const socket=tlsSocket.connect({host:'127.0.0.1',servername:'localhost',port,ca});
        const frame=Buffer.from([0x81,0x82,1,2,3,4,0x6e,0x69]);
        let data=Buffer.alloc(0);socket.setTimeout(3000,()=>socket.destroy(new Error('Upgrade timeout')));
        socket.on('error',reject);socket.on('data',chunk=>{
          data=Buffer.concat([data,chunk]);const end=data.indexOf('\r\n\r\n');
          if(end<0)return;
          if(!data.toString().startsWith('HTTP/1.1 101') || data.length>=end+4+frame.length){socket.destroy();resolve({header:data.subarray(0,end).toString(),payload:data.subarray(end+4),frame});}
        });
        socket.on('secureConnect',()=>socket.write(Buffer.concat([Buffer.from(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${origin}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`),frame])));
      });
    }
    const upgraded=await upgrade(`https://127.0.0.1:${port}`);
    assert.match(upgraded.header,/101 Switching Protocols/);assert.deepEqual(upgraded.payload,upgraded.frame);
    assert.deepEqual(seen[2],{url:'/api/media',origin:`http://127.0.0.1:${upstreamPort}`});
    assert.match((await upgrade('https://foreign.invalid')).header,/403/);
    assert.match((await upgrade(`https://127.0.0.1:${port}`,'/elsewhere')).header,/403/);
    assert.equal(seen.length,3,'rejected upgrades never reach the host');
  } finally { await close(gateway); await close(upstream); }
});

test('incomplete or invalid HTTPS credentials fail instead of falling back to HTTP',() => {
  assert.equal(loadGatewayTls({}),undefined);
  assert.throws(() => loadGatewayTls({DIPLAY_TLS_CERT:'missing.pem'}),/Set both/);
  assert.throws(() => loadGatewayTls({DIPLAY_TLS_KEY:'missing.pem'}),/Set both/);
  assert.throws(() => loadGatewayTls({DIPLAY_TLS_KEY_PASSPHRASE:'local-test'}),/Set both/);
  assert.throws(() => createGateway('http://127.0.0.1:8080',{cert:Buffer.from('invalid')}),/requires both/);
  assert.throws(() => createGateway('http://127.0.0.1:8080',{cert:Buffer.from('invalid'),key:Buffer.from('invalid')}));
});
