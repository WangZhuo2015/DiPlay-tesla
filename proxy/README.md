# Optional DiPlay proxy

This Node.js 22+ process is deployed independently of the Android CarPlay host. No Android
module imports it or requires it. Tesla can open `http://ANDROID_IP:8080` directly without it.
There are no npm dependencies.

## Browser gateway

```powershell
$env:DIPLAY_UPSTREAM = 'http://192.168.1.20:8080'
$env:DIPLAY_BIND = '0.0.0.0'
$env:DIPLAY_PORT = '8090'
node proxy/server.mjs
```

Open `http://GATEWAY_IP:8090` and use the pairing code from the Android host. This is a fixed
reverse proxy for the browser interface. It preserves pairing authentication, changes a
same-origin browser request to the upstream origin, and reports 502 if the host is unavailable.
An HTTPS terminator can be put in front of this service; send the original Host header.

## Explicit web proxy

An authenticated HTTP/HTTPS forward proxy can be enabled separately:

```powershell
$env:DIPLAY_FORWARD_PORT = '8888'
$env:DIPLAY_PROXY_TOKEN = 'choose-a-random-secret-at-least-24-characters'
node proxy/server.mjs
```

Clients must explicitly select this proxy and send `Proxy-Authorization: Bearer SECRET`.
Only destination ports 80 and 443 are accepted. It binds to loopback unless `DIPLAY_BIND`
is set. Do not expose it beyond your trusted network.

**This service does not create a hotspot, install a VPN, provide NAT/DNS, or give Tesla internet
access automatically.** A Tesla browser has no proxy setting managed by DiPlay. Use the
Android device's internet-sharing hotspot or an independently configured router for that.
Stopping either proxy has no effect on the iPhone/Android CarPlay session; direct browser
access to the host remains available.

Run `node --test proxy/test/*.test.mjs` from the repository root.
