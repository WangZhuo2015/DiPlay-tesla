import test from 'node:test';
import assert from 'node:assert/strict';
import {gatewayConfig,generateGateway} from '../android-root/config.mjs';

const local={domain:'carplay.example.invalid',bindAddress:'192.0.2.10',upstream:'http://127.0.0.1:8081'};
test('root gateway validates untrusted local configuration before generating executable files',()=>{
  for(const patch of [
    {domain:'example.invalid\nrespond "injected"'}, {domain:'*.example.invalid'},
    {bindAddress:'0.0.0.0'}, {bindAddress:'192.0.2.10;reboot'},
    {httpsPort:0}, {httpsPort:'443'}, {httpsPort:65536},
    {upstream:'http://169.254.169.254:80'}, {upstream:'https://127.0.0.1:8081'},
    {upstream:'http://user:password@127.0.0.1:8081'}, {upstream:'http://127.0.0.1:8081/api'},
    {upstream:'http://127.0.0.1:8081/?x=1'}, {upstream:'http://127.0.0.1:8081/#secret'},
    {directory:'/data/local/../adb'}, {certificate:'/data/local/$(reboot).pem'},
    {privateKey:'/data/local/key\"\nrespond.pem'}, {addLoopbackAlias:'true'}
  ])assert.throws(()=>generateGateway({...local,...patch}),undefined,JSON.stringify(patch));
});
test('HTTPS authority and upstream origin remain distinct for standard and custom ports',()=>{
  assert.equal(gatewayConfig(local).authority,local.domain);
  const c=gatewayConfig({...local,httpsPort:8443});
  assert.equal(c.authority,`${local.domain}:8443`);
  const {caddyfile,boot}=generateGateway({...local,httpsPort:8443});
  // Origin rejection precedes rewriting; WebSocket CSP follows the public HTTPS port.
  assert.ok(caddyfile.indexOf('respond @foreign_origin')<caddyfile.indexOf('header_up Origin'));
  assert.ok(caddyfile.includes('not header Origin https://carplay.example.invalid:8443'));
  assert.ok(caddyfile.includes('header_up Host 127.0.0.1:8081'));
  const [,pattern,replacement]=caddyfile.match(/header_down Content-Security-Policy "([^"]+)" "([^"]+)"/);
  const upstreamCsp="default-src 'self'; connect-src 'self' ws://127.0.0.1:8081 wss://127.0.0.1:8081";
  assert.equal(upstreamCsp.replace(new RegExp(pattern,'g'),replacement),"default-src 'self'; connect-src 'self' wss://carplay.example.invalid:8443 wss://carplay.example.invalid:8443");
  assert.equal('ws://127a0b0c1:8081'.replace(new RegExp(pattern,'g'),replacement),'ws://127a0b0c1:8081');
  assert.ok(!caddyfile.includes('file_server'));
  assert.ok(!boot.includes('ip addr add'));
  assert.ok(generateGateway({...local,addLoopbackAlias:true}).boot.includes("ip addr add '192.0.2.10/32' dev lo"));
});
test('Android entry metadata contains only the HTTPS origin, independently of TLS and CarPlay',()=>{
  assert.deepEqual(JSON.parse(generateGateway(local).entry),{version:1,url:'https://carplay.example.invalid'});
  assert.deepEqual(JSON.parse(generateGateway({...local,httpsPort:8443}).entry),{version:1,url:'https://carplay.example.invalid:8443'});
  assert.ok(!generateGateway(local).entry.includes('/data/'));
});
