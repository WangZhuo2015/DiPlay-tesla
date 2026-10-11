import {isIP} from 'node:net';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

function androidPath(value) {
  if (typeof value !== 'string' || !/^\/data\/[a-zA-Z0-9_./-]+$/.test(value) || value.split('/').some(part=>part==='..' || part==='.') || value.endsWith('/')) {
    throw new Error('Use an absolute Android /data path without shell or Caddy syntax');
  }
  return value;
}

export function gatewayConfig(input) {
  const domain=input.domain;
  if (typeof domain !== 'string' || domain.length>253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error('Use a lowercase DNS hostname');
  const bindAddress=input.bindAddress;
  if (isIP(bindAddress)!==4 || bindAddress==='0.0.0.0' || bindAddress==='255.255.255.255') throw new Error('Use a specific IPv4 bind address');
  const httpsPort=input.httpsPort??443;
  if (!Number.isInteger(httpsPort) || httpsPort<1 || httpsPort>65535) throw new Error('Invalid HTTPS port');
  let upstream;
  try { upstream=new URL(input.upstream); } catch { throw new Error('Invalid loopback upstream'); }
  if (upstream.protocol!=='http:' || upstream.hostname!=='127.0.0.1' || upstream.username || upstream.password || upstream.pathname!=='/' || upstream.search || upstream.hash || !upstream.port) {
    throw new Error('Upstream must be a fixed http://127.0.0.1:PORT origin');
  }
  const directory=androidPath(input.directory??'/data/local/diplay-https');
  const certificate=androidPath(input.certificate??`${directory}/fullchain.pem`);
  const privateKey=androidPath(input.privateKey??`${directory}/privkey.pem`);
  if (input.addLoopbackAlias!==undefined && typeof input.addLoopbackAlias!=='boolean') throw new Error('addLoopbackAlias must be boolean');
  const authority=domain+(httpsPort===443?'':`:${httpsPort}`);
  return {domain,bindAddress,httpsPort,upstream:upstream.origin,directory,certificate,privateKey,addLoopbackAlias:input.addLoopbackAlias??false,authority};
}

export function generateGateway(input) {
  const c=gatewayConfig(input), quoted=value=>JSON.stringify(value);
  const upstreamAuthority=new URL(c.upstream).host;
  // Caddyfile quoted strings do not use JSON's backslash unescaping rules.
  // This validated authority is IPv4:port; [.] matches literal dots without escapes.
  const cspPattern=`wss?://${upstreamAuthority.replaceAll('.', '[.]')}`;
  const caddyfile=`{
    admin off
    auto_https off
    servers {
        protocols h1 h2
    }
}
https://${c.authority} {
    bind ${c.bindAddress}
    tls ${quoted(c.certificate)} ${quoted(c.privateKey)}
    @foreign_origin {
        header Origin *
        not header Origin https://${c.authority}
    }
    route {
        respond @foreign_origin "Forbidden" 403
        reverse_proxy ${c.upstream} {
            header_up Host ${upstreamAuthority}
            header_up Origin ${c.upstream}
            header_down Content-Security-Policy ${quoted(cspPattern)} ${quoted(`wss://${c.authority}`)}
        }
    }
}
`;
  const boot=`#!/system/bin/sh
# Independent HTTPS gateway: does not start, stop or change CarPlay.
BASE='${c.directory}'
[ -x "$BASE/caddy" ] || exit 1
[ -r '${c.certificate}' ] && [ -r '${c.privateKey}' ] || exit 1
${c.addLoopbackAlias?`ip addr show dev lo | grep -F '${c.bindAddress}/32' >/dev/null || ip addr add '${c.bindAddress}/32' dev lo || exit 1`:'# Bind address is supplied by the local network configuration.'}
if [ -r "$BASE/caddy.pid" ]; then
    PID=$(cat "$BASE/caddy.pid")
    case "$PID" in
        ''|*[!0-9]*) ;;
        *) if [ -r "/proc/$PID/cmdline" ] && tr '\\000' '\\n' < "/proc/$PID/cmdline" | grep -Fx "$BASE/caddy" >/dev/null; then exit 0; fi ;;
    esac
fi
mkdir -p "$BASE/state" "$BASE/config" || exit 1
export XDG_DATA_HOME="$BASE/state" XDG_CONFIG_HOME="$BASE/config"
"$BASE/caddy" start --config "$BASE/Caddyfile" --adapter caddyfile --pidfile "$BASE/caddy.pid" > "$BASE/caddy.log" 2>&1
`;
  const entry=JSON.stringify({version:1,url:`https://${c.authority}`},null,2)+'\n';
  return {caddyfile,boot,entry};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if (args.length!==4 || args[0]!=='--config' || args[2]!=='--output') throw new Error('Usage: node proxy/android-root/config.mjs --config LOCAL.json --output LOCAL_DIRECTORY');
  const generated=generateGateway(JSON.parse((await readFile(args[1],'utf8')).replace(/^\uFEFF/,'')));
  await mkdir(args[3],{recursive:true});
  await writeFile(resolve(args[3],'Caddyfile'),generated.caddyfile,{mode:0o600});
  await writeFile(resolve(args[3],'diplay-https.sh'),generated.boot,{mode:0o700});
  await writeFile(resolve(args[3],'tesla-https-entry.json'),generated.entry,{mode:0o600});
  console.log('Generated local gateway files and Android entry metadata; certificate files are not read or copied.');
}
