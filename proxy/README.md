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

The gateway forwards `/api/media` WebSocket signaling and optional PCM audio, preserving
the first-message pairing check. HTTPS uses WSS on that same origin. WebRTC video travels
directly between the browser and Android over UDP/DTLS-SRTP; both need direct network
reachability. This process is not a TURN server or UDP relay. If video cannot establish
that direct path, the browser automatically falls back to gateway-forwarded JPEG.

## HTTPS browser gateway (0.1.1+)

The Android APK still serves HTTP on port 8080. TLS lives in this independent process;
changing that Android URL to `https://` does not enable encryption.

Prepare a domain and a certificate chain/key for it that the vehicle browser trusts.
Keep the key outside Git. On the gateway device, set:

```powershell
$env:DIPLAY_UPSTREAM = 'http://192.168.1.20:8080' # Android host reachable from this device
$env:DIPLAY_BIND = '0.0.0.0'
$env:DIPLAY_PORT = '8443'
$env:DIPLAY_TLS_CERT = 'C:\certs\fullchain.pem'
$env:DIPLAY_TLS_KEY = 'C:\certs\privkey.pem'
node proxy/server.mjs
```

Then open **`https://YOUR_DOMAIN:8443`**, using the Android pairing code. Resolve that domain
to a gateway address the vehicle can reach and its firmware permits. The certificate must
cover the domain, be valid and include its intermediate chain. Do not expect a self-signed
certificate or a domain certificate opened by IP address to be trusted by the Tesla browser.
Port 443 can be selected with `DIPLAY_PORT`; it removes `:8443` from the URL and may require
OS permissions or router forwarding. The gateway machine must be able to reach Android:8080.

TLS defaults to port 8443 and a minimum of TLS 1.2. Supplying only one credential, unreadable
files or an invalid key/certificate stops startup; it never silently falls back to HTTP.
An encrypted key can use `DIPLAY_TLS_KEY_PASSPHRASE`. Restart the process after renewing the
certificate. No certificate acquisition, DNS, internet sharing, NAT or vehicle restrictions
are managed by this gateway. HTTPS alone does not resolve firmware-specific private-network
restrictions or make the host reachable over the internet.

[Let's Encrypt DNS-01](https://letsencrypt.org/docs/challenge-types/#dns-01-challenge) can
validate a domain without exposing this gateway to the internet; certificate issuance and
vehicle reachability are separate tasks. HTTPS transport certificates are separate from
the MFi identity required for the iPhone's CarPlay authentication.

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
The HTTPS tests generate ephemeral certificates using OpenSSL. On Windows, set
`DIPLAY_TEST_OPENSSL` to your OpenSSL executable if it is not on PATH. Test keys are removed
after the run and are not shipped or used for a vehicle connection.
