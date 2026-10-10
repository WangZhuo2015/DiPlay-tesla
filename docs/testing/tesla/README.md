# Tesla port verification — 2026-10-10

Checked on Windows with JDK 25, Android SDK 37 and a dedicated Android 10/API 29 emulator.
The APK was installed only on that emulator. No iPhone or Tesla vehicle was connected.

## Automated checks

The complete AGENTS.md command and the added modules passed:

```sh
./gradlew :shared:testDebugUnitTest :common:testDebugUnitTest :home:testDebugUnitTest \
  :mobile:lintDebug :home:lintDebug :maphost:lintDebug \
  :mobile:assembleDebug :home:assembleDebug :maphost:assembleDebug \
  :browser:testDebugUnitTest :browser:lintDebug \
  :tesla:testDebugUnitTest :tesla:lintDebug :tesla:assembleDebug
```

| Unit test module | Tests | Failures |
| --- | ---: | ---: |
| shared | 1211 | 0 |
| common | 1012 | 0 |
| home | 4 | 0 |
| browser | 9 | 0 |
| tesla | 4 | 0 |
| Total | 2240 | 0 |

All five requested lint targets and all four application builds passed. The browser
instrumentation APK also compiled. Running `JpegVideoSinkInstrumentedTest` on the
emulator passed one test: real H.264 encoding → buffer-mode decoding → JPEG, including
dimensions and red chroma verification.

`node --test proxy/test/*.test.mjs` passed all three integration tests. JavaScript syntax
and `scripts/check_public_tree.py` passed. Two existing test fixtures were made portable:
the shell fixture uses stdin to retain quotes on Windows, and the update APK fixture
models Android's relative `/` path boundary while still exercising the real FileProvider.
The standalone build was also checked to reject a missing `DIPLAY_AUTH_ASSETS_DIR` before
the application build. This expected rejection is separate from the successful source CI.

Source-only debug APK SHA-256:
`384a85fee7dfd3f9be9a9ab16c82cb660e36d79b5cd8021171d68edc2b998af9`.

## Signed release checks

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

Real iPhone authentication, Tesla browser/network restrictions, sustained JPEG performance,
thermal behavior, Bluetooth audio, microphone/Siri/calls and reconnection require a parked
vehicle and actual host. The source-only APK contains no accessory identity.
