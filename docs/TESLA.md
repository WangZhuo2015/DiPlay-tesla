# DiPlay Tesla port

Version 0.1.5 offers Fit window, Low load (720p) and Clear (1080p) browser display
presets, with manual parameters collapsed by default. Select the actual window mode
in Tesla first. Presets preserve the viewport aspect ratio and change only the selected
profile's size; frame rate and JPEG quality are shared. Saving waits for the next
connection. [Screen sources and public screenshots](TESLA-DISPLAY-PRESETS.md) use
synthetic content without private vehicle or account data.

## What runs where

Install **the Tesla APK on an Android 7.1+ device**, not on the Tesla or the iPhone.
That device runs the existing wired/wireless CarPlay receiver. Tesla opens its browser
on the same local network to display CarPlay and send touches back to the iPhone.

```text
iPhone ← USB / wireless CarPlay → shared + common (Android)
                                      ↑
                         tesla application composition
                                      ↓
                         browser library → Tesla browser

optional proxy process → browser HTTP interface
```

`shared` remains the CarPlay protocol/media core. `common` owns the existing connection,
audio, microphone, diagnostics and settings. Its `CarPlayOutputExtension` interface
allows an application to supply another output; it imports neither the browser library
nor the proxy. `browser` depends on `shared` and owns H.264 WebRTC, JPEG fallback,
optional PCM audio, HTTP/WebSocket pairing, input leases and the static client. `tesla` composes those modules into a
separate APK. The original `mobile`, `home` and `maphost` applications do not install an
output extension and keep their original behavior.

`proxy/` is a separately runnable Node.js service with no npm dependencies and no Gradle
dependency. Direct access works without it. It includes a fixed browser gateway and
an optional authenticated forward web proxy. See [proxy setup](../proxy/README.md).
Internet sharing/NAT/DNS belongs to the Android hotspot or an external router; starting
an HTTP proxy alone does not supply Tesla with internet connectivity.

## Build and connect

Use the JDK/SDK/NDK requirements in [BUILD.md](BUILD.md).
Install CMake 3.22.1 and NDK 28.2.13676358. The first native build fetches official
archives pinned by commit and SHA-256 in `browser/src/main/cpp/NativeDependencies.cmake`.
Dependency sources are shared between ABI builds, with separate build directories.

```powershell
$env:ANDROID_HOME = 'G:\Android' # replace with your SDK directory
.\gradlew.bat :tesla:assembleDebug
```

The output is `tesla/build/outputs/apk/debug/tesla-debug.apk`, package
`com.diplay.tesla.debug`. It can coexist with the original DiPlay application.
The normal source build contains **no accessory identity**. To connect an iPhone,
provide your external runtime authentication assets as in BUILD.md and use
`:tesla:assembleStandaloneDebug`. No credentials are checked into this port.

### Signed releases and authentication

The latest public download is the [Tesla 0.1.1 preview](https://github.com/WangZhuo2015/DiPlay-tesla/releases/tag/tesla-v0.1.1).
The 0.1.2 Release remains a draft; its signed credential-bearing APK is local only. Install a local APK
on the Android host. Its package is `com.diplay.tesla`; it installs separately from the
`.debug` build. Keep the same APK signing key for subsequent release updates.

**The local 0.1.2 standalone APK includes the explicitly provisioned experimental MFi identity**
from the referenced local task, with package entries verified against those inputs.
The identity stays outside Git; normal source builds remain credential-free.
Actual iPhone authentication and Tesla vehicle behavior have not been tested for this version.
APK signing and HTTPS certificates are separate from MFi authentication.
See [the provenance notices](THIRD_PARTY_NOTICES.md#experimental-authentication-data).

The 0.1.3 local test build tries ports 8080–8089 if a firmware service already occupies
the preferred port. Connection settings show the actual URL; use that port for the
independent proxy upstream as well. Other startup errors do not trigger port retries.
It also recognizes a hotspot's actual Wi-Fi bridge membership. The
[local V50 test](testing/tesla/README.md#013-v50-local-test--2026-10-11) authenticated
an iPhone wirelessly and decoded real H.264 / WebRTC video in a computer browser;
sustained audio and Tesla vehicle behavior remain unverified.

For a signed build, set the four signing variables in
[BUILD.md](BUILD.md#build-a-release-apk), then run:

```sh
./gradlew :tesla:lintRelease :tesla:assembleRelease
```

The output is `tesla/build/outputs/apk/release/tesla-release.apk`. To include an identity
you are authorized to use and distribute, also set `DIPLAY_AUTH_ASSETS_DIR` and select
`:tesla:assembleStandaloneRelease`. That task rejects missing or empty assets. Recipients
can extract the accessory private key from such an APK. The APK signing key remains local.

1. Install and open DiPlay Tesla on the Android host.
2. Connect Tesla to an internet-sharing network that can reach that host. Prefer USB
   CarPlay from the iPhone when the Android Wi-Fi interface is already providing the
   Tesla hotspot. Wireless CarPlay needs a supported concurrent network arrangement;
   the existing Same LAN / Existing Wi-Fi mode can use an external router.
3. In **Settings → Connection → Tesla browser**, find the host URLs and six-digit pairing code.
   Open the displayed URL in Tesla and enter the code, or use the copied browser link.
   The code lasts five minutes; reopen the phone page after expiry or five wrong attempts.
   This browser stores the resulting session credential and reconnects without re-entering the code.
4. Start the existing USB/wireless connection from DiPlay. Keep the app/session service
   running; Tesla video is rendered only in the browser, without a second Android video decoder.
5. Audio defaults to the existing Android/car Bluetooth route. Optionally click
   **Browser audio (experimental)** to play music and navigation PCM in the browser.
   Choose an 80/200/400 ms buffer (200 ms default). Hidden pages, suspended audio contexts,
   expired readiness and backpressure release the route to Android. Calls, Siri and
   microphone capture remain local; the browser never captures a microphone.

The browser supports two touch contacts, Home, Back, Siri, play/pause, next and previous.
Only one page may hold touch input at a time. Hidden/closed pages release their contacts;
the host releases a lost contact after one second without a heartbeat.

## Right window and full window

Use **Settings → Display → Tesla resolution**, or the browser's **Menu → Display settings**.
Both edit the same persisted profiles:

| Profile | Initial canvas | Meaning |
| --- | --- | --- |
| Right window | 1024 × 768 | CarPlay in Tesla's smaller/right browser window |
| Full window | 1920 × 1080 | CarPlay in the larger/full browser window |

These are editable starting points, not detected Tesla panel specifications. Tesla model,
firmware, toolbars and window mode change the available viewport. Width accepts even values
320–2560, height even values 240–1440, frame rate 5–30, and JPEG quality 40–95.
The selected pixel dimensions are advertised to the iPhone, independently of the Android
host's own screen size. Host window changes do not renegotiate this remote canvas.
JPEG quality applies only to fallback. WebRTC carries the original iPhone H.264 stream.

Saving keeps a running CarPlay session intact and displays a reconnect notice. Select
**Apply and reconnect** in the browser, or **Reconnect now** in Android settings, when
ready. Right and full sizes remain independent. Saving identical values does not request
a reconnect. Selecting a profile does not change Tesla's system window arrangement; use
the car's own browser window controls. The page's Fullscreen button requests the browser
Fullscreen API when supported.

The client preserves picture aspect ratio and ignores touches that start in letterbox
bars. Touch coordinates map to the actual negotiated frame, including after a profile
change. The server retains only the latest JPEG, so slow or reconnecting clients do not
accumulate stale frames.

## Selected DiPlay-CN enhancements

Reference: [DiPlay-CN](https://github.com/serein-morii/DiPlay-CN), tree
`5e9002cb412bb568e8479114476b142401336a1e`, and its
[CN optimization log](https://github.com/serein-morii/DiPlay-CN/blob/5e9002cb412bb568e8479114476b142401336a1e/docs/CN_OPTIMIZATIONS.md).

- Adapted CN's one-time Simplified Chinese fallback for unsupported device languages to
  the Tesla application. Explicit language choices and all supported locales, including
  Ukrainian, are preserved. The original applications keep their existing locale policy.
- Applied CN's same-configuration/resume principle: saving an unchanged profile and
  resizing the Android host window do not interrupt the remote session. The browser can
  reconnect to the existing host after a short network interruption.
- Reused the core's connection-stage messages in the browser. The browser toolbar supplies
  immediate day/night styling and common CarPlay/media shortcuts without reconnecting.
- Kept the CN-origin Bluetooth reconnect and fine-grained settings already adopted by
  the upstream base. BYD cluster, ADB firmware controls and Bluetooth suspension were
  not enabled for Tesla: they address BYD-specific hardware or can disrupt its audio route.

The Tesla updater uses this repository and selects only `DiPlay-Tesla-*.apk` assets with
`SHA256SUMS.txt`; it does not install an upstream or CN package. Publish those artifacts
with an appropriate stable signing key before using this update flow.

## Browser protocol and boundaries

Public GET routes: `/`, `/index.html`, `/app.js`, `/media.js`, `/browser-audio.js`,
`/style.css`, `/rtc-licenses.txt`. HTTP API routes require `Authorization: Bearer PAIRING_CODE`.
WebSocket `/api/media` requires a same-host Origin and a first `hello` message containing
the pairing code; only one authenticated media viewer owns the session. Foreign Origins are rejected;
the client never places the token in an API URL. A copied fragment token is removed from
the browser address bar after loading and saved only in that tab's session storage.

| Endpoint | Method | Payload / result |
| --- | --- | --- |
| `/api/status` | GET | Connection stage, decoder error, saved/active profiles, pending reconnect |
| `/api/frame?after=N` | GET | Latest JPEG and `X-Frame-Sequence`, or 204 when unchanged |
| `/api/touch` | POST | `{client, contacts:[{id,x,y,down}]}`; normalized coordinates, max two contacts |
| `/api/action` | POST | `{action}`: home/back/siri/play/next/previous/reconnect |
| `/api/display` | POST | `{mode,right:{width,height},full:{width,height},fps,jpegQuality}` |
| `/api/media` | WebSocket | Authenticated RTC offer/answer/feedback and optional binary PCM |

JSON HTTP bodies are capped at 8 KiB; masked, unfragmented WebSocket messages at 32 KiB,
checked before allocation. Control messages other than SDP are limited to 2 KiB. HTTP
workers, media clients, outgoing packets and outstanding audio acknowledgements are bounded.
H.264 WebRTC uses upstream libdatachannel's packetizer and DTLS-SRTP with no codec or
crypto patches. The queue holds at most six frames/2 MiB/150 ms; overflow invalidates
the reference chain until a fresh IDR. JPEG decoding stops only after browser playback
starts, and resumes when decoding stalls, negotiation fails or the viewer disconnects.
HEVC and BYD secondary displays are not advertised by this output.

PCM preserves stream identity, channels and original sample rate; Web Audio handles
resampling. Its 20-byte little-endian header contains magic `0x31415057`, stream ID,
sample rate, channel count (u16), reserved (u16), sequence (u32), followed by S16LE PCM.
The browser acknowledges packets and renews a 2.5-second playback readiness lease.
Music/navigation streams buffer separately. Backlog or suspension stops remote playback
instead of blocking the receiver; the default media sink's remote route remains disabled.

JNI lifecycle, bounded reference-chain recovery and PCM framing were selectively adapted
from the public tepla 0.2.1 source release; attribution and dependency licenses accompany
the source and APK. Its device-specific VPN and SRTP optimizations were not imported.

Local HTTP does not encrypt the stream or pairing token. Use a trusted local network;
an independently deployed HTTPS gateway can add transport encryption. Tesla firmware
browser/network restrictions and actual Android buffer-mode decoder support still need
parked vehicle testing. JPEG compression adds CPU/bandwidth cost: start at 1024×768/20 fps
and increase only after checking responsiveness, temperature, audio and reconnection.
This port does not claim validated support while driving or change Tesla's restrictions.

## HTTPS access and performance checks

Android:8080 remains HTTP. Version 0.1.1 adds explicitly configured TLS to the independent
proxy, preserving the core/proxy separation. See the [HTTPS gateway procedure](../proxy/README.md#https-browser-gateway-011).
Open `https://YOUR_DOMAIN:8443` after supplying a trusted full certificate chain and its key,
configuring DNS and making the gateway reachable from the car. The gateway must reach
Android:8080. Selecting port 443 removes the port from the URL. No domain/certificate has
been deployed for this project. HTTPS does not manage internet sharing, routing or
firmware-specific private-network restrictions; changing the Android URL's scheme alone
does not work. Transport certificates and MFi accessory authentication are separate.

The gateway forwards `/api/media` using WS/WSS as well as HTTP. WebRTC video uses direct
browser-to-Android UDP with host ICE candidates; the proxy is not a TURN/UDP relay.
If only the gateway is reachable, JPEG remains available. DTLS negotiation selects
Android as the client to avoid MbedTLS 3.6's fragmented initial ClientHello limitation.

The canvas now resizes only when JPEG dimensions change, avoiding a backing-store reset
for every frame. This reduces unnecessary browser work; sustained performance has not
been measured in a vehicle. For blur, check the selected window profile and avoid enlarging
a small canvas. WebRTC clarity follows negotiated resolution; for JPEG, adjust quality
toward 85–90 gradually. For stutter, first lower FPS
to 15, then evaluate resolution, bandwidth and host temperature. Change one variable at
a time; saved changes still wait for reconnection.

For browser-routed audio, compare 200 and 400 ms before trying 80 ms. For Android-routed
audio, compare the existing 500/1000 ms music buffers. These controls operate on separate
routes and do not affect direct iPhone-to-car Bluetooth. Buffering adds latency. Vehicle
browser audio availability, sustained performance and call routing require hardware testing.

## Verification

See the [recorded checks and actual screenshots](testing/tesla/README.md) for this port.

Run the complete Android command in AGENTS.md, plus:

```sh
./gradlew :browser:testDebugUnitTest :browser:lintDebug \
  :tesla:testDebugUnitTest :tesla:lintDebug :tesla:assembleDebug
node --test proxy/test/*.test.mjs browser/test/*.test.mjs
```

With an Android device/emulator connected, run `:browser:connectedDebugAndroidTest`.
Tests encode real H.264 and check JPEG dimensions/chroma and browser playback or fallback.
The optional external-browser test uses an emulator UDP redirection and verifies actual
desktop H.264 WebRTC playback before completion. It needs no iPhone authentication assets.

Automated coverage includes profile negotiation/persistence, input ownership and expired
touch release, cropped/strided YUV conversion, API pairing/origin checks, update package
selection and independent proxy forwarding. Real iPhone authentication, sustained decoder
performance, Tesla browser access and Bluetooth call routing require physical hardware.

## Browser screen and diagnostics in 0.1.2

The media surface occupies the complete viewport. A corner Menu button opens controls;
virtual keys default to hidden, with an explicit toggle persisted in that browser.
Visible keys float over the image and do not resize it or change touch coordinates.
The image keeps its aspect ratio. **Use current window size** fills only the selected
right/full profile, proportionally bounds it to 2560×1440 and rounds to even dimensions.
Saving does not interrupt CarPlay; reconnect requires confirmation inside the page.

Live diagnostics in the menu show measured decoded FPS, dropped frames, queued audio
and rebuffer counts. Android memory, battery/available thermal sensor temperatures and
CPU policies are sampled every two seconds on a separate browser worker. A snapshot
older than six seconds is labeled stale; unavailable fields are unknown. Sensor names
are preserved; policy limits are not interpreted as proof of thermal throttling.

The browser and Android video watchdogs distinguish a quiet source from a decoder stall.
A stationary screen with fresh viewer feedback stays on WebRTC. Fresh source frames
without decoding progress for five seconds trigger JPEG fallback; initial playback and
missing viewer feedback still have bounded timeouts. This adapts the useful diagnostics
and static-scene handling from the referenced local tepla experiment without importing
its device-specific hotspot/root/VPN service configuration into the core or proxy.

The page supports Chinese, English and Arabic/RTL, selected from browser language or
`?lang=zh-CN`, `?lang=en`, `?lang=ar`.
