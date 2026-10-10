# DiPlay Tesla port

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
nor the proxy. `browser` depends on `shared` and handles its own decoder, HTTP transport,
authentication, input lease and static client. `tesla` composes those modules into a
separate APK. The original `mobile`, `home` and `maphost` applications do not install an
output extension and keep their original behavior.

`proxy/` is a separately runnable Node.js service with no npm dependencies and no Gradle
dependency. Direct access works without it. It includes a fixed browser gateway and
an optional authenticated forward web proxy. See [proxy setup](../proxy/README.md).
Internet sharing/NAT/DNS belongs to the Android hotspot or an external router; starting
an HTTP proxy alone does not supply Tesla with internet connectivity.

## Build and connect

Use the JDK/SDK/NDK requirements in [BUILD.md](BUILD.md).

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

The [Tesla 0.1.0 preview](https://github.com/WangZhuo2015/DiPlay-tesla/releases/tag/tesla-v0.1.0)
contains a signed APK, a separate proxy archive and `SHA256SUMS.txt`. Install the APK
on the Android host. Its package is `com.diplay.tesla`; it installs separately from the
`.debug` build. Keep the same APK signing key for subsequent release updates.

**This preview APK contains no MFi accessory identity and cannot complete local offline
CarPlay authentication by itself.** It supports browser pairing, display configuration
and host deployment tests. An iPhone connection additionally needs a configured usable
authentication source. APK signing establishes the application's origin; it does not
provide MFi authentication.

Both upstream projects describe experimental assets recovered from Carlinkit C2Air
Allwinner V821 firmware; see [the provenance notices](THIRD_PARTY_NOTICES.md#experimental-authentication-data).
This port does not automatically extract or redistribute third-party private keys.

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
3. In **Settings → Connection → Tesla browser**, find the host URLs and pairing code.
   Open `http://HOST_IP:8080` in Tesla and enter the code, or use the copied browser link.
4. Start the existing USB/wireless connection from DiPlay. Keep the app/session service
   running; the Android screen can be covered by another app without stopping the stream.
5. Route audio from the Android host to the car using Bluetooth, or select the existing
   **Car Bluetooth audio** option to keep iPhone audio with the car. The browser does not
   carry audio or capture a microphone. Siri/call uplink depends on the Android host's
   microphone and the chosen Bluetooth route, which require device testing.

The browser supports two touch contacts, Home, Back, Siri, play/pause, next and previous.
Only one page may hold touch input at a time. Hidden/closed pages release their contacts;
the host releases a lost contact after one second without a heartbeat.

## Right window and full window

Use **Settings → Display → Tesla resolution**, or the browser's **Display settings**.
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

Public GET routes: `/`, `/index.html`, `/app.js`, `/style.css`. All API routes require
`Authorization: Bearer PAIRING_CODE`. API requests with a foreign Origin are rejected;
the client never places the token in an API URL. A copied fragment token is removed from
the browser address bar after loading and saved only in that tab's session storage.

| Endpoint | Method | Payload / result |
| --- | --- | --- |
| `/api/status` | GET | Connection stage, decoder error, saved/active profiles, pending reconnect |
| `/api/frame?after=N` | GET | Latest JPEG and `X-Frame-Sequence`, or 204 when unchanged |
| `/api/touch` | POST | `{client, contacts:[{id,x,y,down}]}`; normalized coordinates, max two contacts |
| `/api/action` | POST | `{action}`: home/back/siri/play/next/previous/reconnect |
| `/api/display` | POST | `{mode,right:{width,height},full:{width,height},fps,jpegQuality}` |

JSON bodies are capped at 8 KiB. HTTP workers and pending requests are bounded. H.264
decode and JPEG compression use their own bounded queue/worker; audio remains in the
local media sink. Decode overload discards the broken reference chain and requests a
fresh keyframe. HEVC and BYD secondary displays are not advertised by this output.

Local HTTP does not encrypt the stream or pairing token. Use a trusted local network;
an independently deployed HTTPS gateway can add transport encryption. Tesla firmware
browser/network restrictions and actual Android buffer-mode decoder support still need
parked vehicle testing. JPEG compression adds CPU/bandwidth cost: start at 1024×768/20 fps
and increase only after checking responsiveness, temperature, audio and reconnection.
This port does not claim validated support while driving or change Tesla's restrictions.

## Verification

See the [recorded checks and actual screenshots](testing/tesla/README.md) for this port.

Run the complete Android command in AGENTS.md, plus:

```sh
./gradlew :browser:testDebugUnitTest :browser:lintDebug \
  :tesla:testDebugUnitTest :tesla:lintDebug :tesla:assembleDebug
node --test proxy/test/*.test.mjs
```

With an Android device/emulator connected, run `:browser:connectedDebugAndroidTest`.
This encodes a real H.264 frame, passes it through the browser decoder and checks the
JPEG dimensions and chroma. It does not require an iPhone or authentication assets.

Automated coverage includes profile negotiation/persistence, input ownership and expired
touch release, cropped/strided YUV conversion, API pairing/origin checks, update package
selection and independent proxy forwarding. Real iPhone authentication, sustained decoder
performance, Tesla browser access and Bluetooth call routing require physical hardware.
