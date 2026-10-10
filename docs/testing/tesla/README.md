# Tesla port verification — 2026-10-10

Checked on Windows with JDK 25, Android SDK 37 and a dedicated Android 10/API 29 emulator.
The APK was installed only on that emulator. No iPhone or Tesla vehicle was connected.

## 0.1.1 media and HTTPS checks

The full AGENTS.md CI command, browser/Tesla tests and lint, and signed Release build
passed with CMake 3.22.1 and NDK 28.2.13676358. WebRTC native libraries were built for
arm64-v8a, armeabi-v7a and x86_64. The unit tests total 2250 with no failures or errors.

- `node --test proxy/test/*.test.mjs browser/test/*.test.mjs`: 9 passed, including
  continuous 44.1 kHz PCM across a 120 ms scheduling pause, navigation stream isolation,
  backlog/suspension failover, HTTPS trust and pairing, WSS upgrades and origin rejection.
- `BrowserMediaSocketTest`: real masked WebSocket upgrade/hello/pairing, foreign-origin
  and wrong-token rejection, binary PCM rate/channel/payload preservation and route release.
- `WebRtcInstrumentedTest` external-browser mode: real Android H.264 encoding →
  libdatachannel DTLS-SRTP → desktop Chromium decoding and playback. Completion required
  the actual WebRTC route and at least five accepted frames. The final run passed in 52 s.
  An emulator-only fixed UDP port and rewritten host candidates enable this test; production
  uses ordinary local ICE candidates and dynamically allocated ports.
- The API 29 WebView lacks H.264 WebRTC support. Its automatic JPEG fallback passed;
  `JpegVideoSinkInstrumentedTest` also passed real H.264 decoding, dimensions and red chroma.
- The signed APK installed and started on the dedicated emulator; its HTTP browser service
  returned the bundled page. No AndroidRuntime fatal error was observed.

The external test produces a solid red synthetic frame, not an iPhone/CarPlay screen:
[1024×768 view](browser-webrtc-compact.jpg), [1920×1080 view](browser-webrtc-full.jpg).
These viewport checks do not establish vehicle resolution, quality or sustained performance.

The actual browser source was also served by a local layout fixture with only the CSS
body font enlarged from 16 to 20.8 px (130%) and an inactive mock status. At 1024×768
the settings form scrolls, with Save/Cancel accessible by keyboard; at 1920×1080 the
whole form fits. The audio toolbar wraps without losing its controls:
[compact form](browser-profile-font130-compact.jpg),
[compact actions](browser-profile-font130-compact-actions.jpg),
[full form](browser-profile-font130-full.jpg),
[compact toolbar](browser-toolbar-font130-compact.jpg),
[full toolbar](browser-toolbar-font130-full.jpg).
Android settings layout was unchanged; the existing compact/full/Arabic 130% screenshots
below remain the native settings record. The browser currently supplies Chinese/English copy.

The public tepla 0.2.1 source ZIP used for selective reference has SHA-256
`a8787033c7f7b1c232a38d63c555c1cd53b174fea2c029bc4eea546e0e7a61ca`.
No third-party APK or authentication identity was imported.

The 0.1.1 APK uses package `com.diplay.tesla`, versionCode 2, min API 25 and target API 37.
`apksigner verify` passed with the same signing certificate as 0.1.0, documented below.
Its six browser assets include the native dependency notices; all three RTC ABI libraries
are present, with no offline-MFi identity or credential container in the assets.
Current distribution hashes are recorded in the Release's `SHA256SUMS.txt`.

## Automated checks

The complete AGENTS.md command and the added modules passed:

```sh
./gradlew :shared:testDebugUnitTest :common:testDebugUnitTest :home:testDebugUnitTest \
  :mobile:lintDebug :home:lintDebug :maphost:lintDebug \
  :mobile:assembleDebug :home:assembleDebug :maphost:assembleDebug \
  :browser:testDebugUnitTest :browser:lintDebug \
  :tesla:testDebugUnitTest :tesla:lintDebug :tesla:assembleDebug \
  :tesla:lintRelease :tesla:assembleRelease :browser:assembleDebugAndroidTest
```

| Unit test module | Tests | Failures |
| --- | ---: | ---: |
| shared | 1211 | 0 |
| common | 1012 | 0 |
| home | 4 | 0 |
| browser | 19 | 0 |
| tesla | 4 | 0 |
| Total | 2250 | 0 |

All five requested lint targets and all four application builds passed. The browser
instrumentation APK also compiled. Running `JpegVideoSinkInstrumentedTest` on the
emulator passed one test: real H.264 encoding → buffer-mode decoding → JPEG, including
dimensions and red chroma verification.

`node --test proxy/test/*.test.mjs browser/test/*.test.mjs` passed all nine tests. JavaScript syntax
and `scripts/check_public_tree.py` passed. Two existing test fixtures were made portable:
the shell fixture uses stdin to retain quotes on Windows, and the update APK fixture
models Android's relative `/` path boundary while still exercising the real FileProvider.
The standalone build was also checked to reject a missing `DIPLAY_AUTH_ASSETS_DIR` before
the application build. This expected rejection is separate from the successful source CI.

Historical 0.1.0 source-only debug APK SHA-256:
`384a85fee7dfd3f9be9a9ab16c82cb660e36d79b5cd8021171d68edc2b998af9`.

## Historical 0.1.0 signed release checks

The full command above was run again with `:tesla:lintRelease :tesla:assembleRelease`;
all targets passed. The proxy's three integration tests passed again. The standalone
release task was separately checked to reject missing authentication assets.

`DiPlay-Tesla-0.1.0.apk` has package `com.diplay.tesla`, versionCode 1, versionName 0.1.0,
minimum API 25 and target API 37. It is not debuggable. Android `apksigner verify` passed
with one 3072-bit RSA signer and APK Signature Scheme v2. The signing certificate SHA-256
is `ea2fcd23e0571640b90098e970116427ae13b71a4744941a0fe4b3042f4ba117`.
The signing key and password configuration remain in an ignored local private directory.

APK SHA-256: `fcdb22b03cb1fdc44fa998c4b227c4350dc831f7dbb544060f230945d9ef8805`.
ZIP integrity and content checks confirmed that the three browser assets are included,
with no offline-MFi directory, credential containers or proxy included in the APK.
The separately packaged proxy includes its source, instructions, tests and the GPL license.
The preview does not provide standalone offline iPhone authentication.

## Manual smoke checks

- The Tesla APK installed and opened without an AndroidRuntime fatal exception.
- The real Android browser server was reached through an ADB localhost forward.
  Browser pairing succeeded; CarPlay actions correctly remained disabled without a session.
- The browser saved FULL at 1600×900, retained RIGHT at 1024×768, and preserved both after
  reloading. The native profile dialog showed the same saved values.
- Native settings and profile dialogs were inspected at 130% font scale, in a compact
  640×480/160 dpi window and a full 1920×1080/240 dpi window. The form scrolls and keeps
  Save/Cancel accessible. Arabic layout mirrors navigation and maintains width×height
  ordering for the numeric profile summary.
- Browser profiles were inspected at 1024×768 and 1920×1080. The screenshots show saved
  settings with no active CarPlay connection; they are not simulated CarPlay frames.

## Screenshots

| View | Settings | Profile form |
| --- | --- | --- |
| Compact, font 130% | [Settings](display-compact-font130.png) | [Form](profile-compact-font130.png) |
| Full, font 130% | [Settings](display-full-font130.png) | [Form](profile-full-font130.png) |
| Arabic, full, font 130% | [Settings](display-ar-font130.png) | [Form](profile-ar-font130.png) |
| Browser | [1024×768](browser-compact.jpg) | [1920×1080](browser-full.jpg) |

## Hardware work remaining

Real iPhone authentication, Tesla browser/network restrictions, sustained WebRTC/JPEG performance,
thermal behavior, Bluetooth audio, microphone/Siri/calls and reconnection require a parked
vehicle and actual host. The source-only APK contains no accessory identity.
