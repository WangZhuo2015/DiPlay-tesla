# Credits and license notices

## Receiver

DiPlay is a modified version of [xcertplay by shilapi](https://github.com/shilapi/xcertplay). The upstream receiver is licensed under GNU GPL version 3; the full text is in `LICENSE` and the original README is retained in `docs/UPSTREAM-README.md`.

Upstream credits [LIVI](https://github.com/f-io/LIVI) and [Showcase](https://github.com/amineross/showcase) for protocol research. Existing source comments and attribution are preserved.

## Home and settings UI

`common/src/main/java/com/shilapi/xcertplay/DiPlayActivity.kt` adapts the palette, visual arrangement and interface copy of the [DiAuto project](https://github.com/shihabal3amri/DiAuto). DiAuto's source is licensed under AGPL version 3. The UI file is marked AGPL-3.0-only; its license text is included in `docs/licenses/DiAuto-AGPL-3.0.txt`.

## CarPlay icon

The unmodified icon was obtained from Apple's developer site at:

https://developer.apple.com/assets/elements/icons/carplay/carplay-96x96_2x.png

CarPlay and the CarPlay icon are Apple Inc. marks/assets. This asset is not covered by the project's open-source code license. Its use here does not imply Apple approval or certification.

## Runtime dependencies

- AndroidX and Jetpack Compose — Android Open Source Project; Apache License 2.0.
- Kotlin standard library — JetBrains; Apache License 2.0.
- Bouncy Castle 1.79 — The Legion of the Bouncy Castle Inc.; Bouncy Castle license (MIT-style).
- JmDNS 3.6.3 — JmDNS contributors; Apache License 2.0.
- SLF4J — QOS.ch; MIT license.
- NanoHTTPD 2.3.1 — NanoHTTPD contributors; BSD 3-Clause license. Used only by the optional browser output library. Its [full notice](licenses/dependencies/NanoHTTPD-LICENSE.txt) accompanies the source.

Gradle dependency declarations and version catalog accompany the source. License files available in the resolved artifacts are included under `docs/licenses/dependencies/`.

## Native call echo cancellation

DiPlay vendors a subset of [SpeexDSP 1.2.1](https://github.com/xiph/speexdsp/tree/SpeexDSP-1.2.1) from Xiph.org Foundation and its contributors, including the acoustic echo canceller, preprocessor and FFT/filterbank support. It is compiled into `libspeex_echo.so` for the optional experimental **Call echo cancellation** feature.

SpeexDSP uses a BSD-style three-clause license. The full copyright notices, redistribution conditions and disclaimer are retained in [the vendored COPYING file](../shared/src/main/jni/speexdsp/COPYING). Component source headers retain their additional notices, including KISS FFT's Mark Borgerding attribution. The [vendoring notes](../shared/src/main/jni/speexdsp/README.md) identify the source version and build configuration.

## Software Opus microphone encoder

DiPlay vendors [Concentus](https://github.com/lostromb/concentus), Logan Stromberg's pure-Java port of the Opus reference library from Xiph.Org Foundation, Skype Limited, Microsoft Corporation and other contributors. It encodes the CarPlay microphone on head units whose Android has no MediaCodec Opus encoder.

Concentus uses the Opus BSD-style license. The full copyright notices, redistribution conditions and disclaimer are retained in [the vendored LICENSE file](../shared/src/main/java/org/concentus/LICENSE). The [vendoring notes](../shared/src/main/java/org/concentus/README.md) identify the source commit.

## Experimental authentication data

The upstream DiPlay public preview APK includes an accessory certificate/key pair recovered from public Carlinkit C2Air Allwinner V821 firmware during the owner's local investigation. These data are not newly generated Apple-issued credentials for DiPlay and are not relicensed as project source code. Upstream bundles them to reproduce the offline experiment; continued acceptance and suitability for general distribution are unresolved. See the [DiPlay notice](https://github.com/shihabal3amri/DiPlay/blob/main/docs/THIRD_PARTY_NOTICES.md) and the matching [DiPlay-CN notice](https://github.com/serein-morii/DiPlay-CN/blob/main/docs/THIRD_PARTY_NOTICES.md). These notices describe provenance; they do not independently establish that both APKs contain identical bytes.

**The DiPlay Tesla 0.1.10 complete APK explicitly bundles the owner's provisioned experimental identity**, also used for the 0.1.1 local debug experiment in the referenced “检查 ADB 连接” task. Inputs remain outside Git and are not included in source archives or the proxy ZIP. This is separate from Android application signing and is not a new Apple-issued DiPlay identity. The owner confirmed normal audio and touch on a 2026 Model Y Juniper with a ZTE V50 mobile Wi-Fi host and iPhone 16 Pro Max / 17 Pro Max, both on iOS 27.0.1; see [vehicle validation](testing/tesla/README.md#model-y-juniper-vehicle-report--2026-10-12). Android signing private keys and user HTTPS domains/certificates/private keys, hotspot passwords and routing configuration are not distributed.

**The DiPlay Tesla 0.1.0 and 0.1.1 previews contain no accessory identity.** They cannot perform local offline CarPlay authentication without a separately provisioned identity. The external asset input is for identities the builder is authorized to use and distribute. No third-party identity is imported automatically. Source archives contain no private keys, and the separate Android APK-signing key is never distributed.

## Tesla port references

The one-time Chinese locale fallback in `tesla/src/main/java/com/diplay/tesla/TeslaLocaleDefault.kt`
adapts the policy in [DiPlay-CN](https://github.com/serein-morii/DiPlay-CN), whose locale source
is marked AGPL-3.0-only. Attribution and the selected connection/resume behaviors are recorded
in [TESLA.md](TESLA.md). The existing AGPL license text applies to this adaptation.

The initial JPEG browser transport and proxy were implemented here. The
[marcraft2/tesla-carplay](https://github.com/marcraft2/tesla-carplay) browser/hotspot approach
was consulted for architecture context; no adapter-specific code or bundled credentials
were copied.

The 0.1.1 browser WebRTC implementation adapts JNI peer lifecycle and signaling, the
bounded keyframe-recovery policy and PCM packet framing from the GPL-3.0 tepla 0.2.1
[public source release](https://github.com/hkhvk70-dot/tesla-carplay-local-entry/releases/tag/tepla-v0.2.1).
The downloaded source ZIP SHA-256 is recorded in the verification notes. Its device-specific
VPN routing, custom packetizer/SRTP patches, binary APK and authentication identity were
not imported. The audio scheduler and route failover are implemented here.

### WheelPlay browser policy references

The unreleased Tesla browser enhancements selectively adapt the compressed-frame queue
and recovery policies from [WheelPlay by fython and contributors](https://github.com/fython/wheelplay),
fixed at commit [`4ed3536822998babd086e4fcb1a384e791b0e2d4`](https://github.com/fython/wheelplay/tree/4ed3536822998babd086e4fcb1a384e791b0e2d4).
WheelPlay retains the DiPlay / xcertplay GNU GPL version 3 license and upstream component
notices. The full GPL text remains in this repository's `LICENSE`.

The references are WheelPlay's `RtcFrameQueue.kt`, `RtcVideoStream.kt`,
`RtcReceiverHealth.kt` and `docs/WEBRTC_RECOVERY.md` for the 50 ms queue and 4/10/30-second
recovery choices, plus `common/src/main/assets/web/app.js` for optional Canvas presentation
and its diagnostic design. These are adapted to the separate `browser` module, including
its existing H.264 transport and audio/input ownership. The implementation and differences
are documented in [the source comparison](TESLA-WHEELPLAY-COMPARISON.md).
WheelPlay's native video-buffer, RTP/SRTP and media-send patches, VPN/root routing,
browser microphone, device credentials and authentication assets are not imported.
The APK's `rtc-licenses.txt` contains the same short source attribution. These additions
describe source changes after Tesla 0.1.10, not the contents of that existing release APK.

### WheelPlay RTC retry policy

The JPEG-to-WebRTC retry gate and browser capability-error classification selectively adapt
WheelPlay commit
[`44635dd94e95fed6a8973faf85437c8a9342e44a`](https://github.com/fython/wheelplay/commit/44635dd94e95fed6a8973faf85437c8a9342e44a)
by Siubeng and contributors, under the retained GNU GPL version 3 license.
The 5/10/20/30-second backoff is adapted to Tesla's independent RTC worker and existing
media/input ownership, with a continuous healthy 60-second interval before resetting backoff.
The browser distinguishes explicit unsupported video from transient failures; unlike the
reference classification, Tesla keeps `NotAllowedError` retryable. WheelPlay's `LanWebServer`
implementation is not imported. Scope and local changes are documented in
[the RTC retry notes](TESLA-RTC-RETRY.md); the APK's `rtc-licenses.txt` records the same fixed
source and policy attribution. Existing native dependency and Concentus notices remain unchanged.

### WheelPlay AirPlay authentication hardening

The 2026-10-28 source adaptation selectively incorporates the AirPlay authentication boundary
and synthetic pair-verify/socket regression fixtures from WheelPlay commit
[`7f5da9864e6d668867c924403e0311fc9470042a`](https://github.com/fython/wheelplay/commit/7f5da9864e6d668867c924403e0311fc9470042a)
by Siubeng and contributors, under the retained GNU GPL version 3 license.
It adapts `AirPlaySession.kt`, `PairVerify.kt` and `AirPlaySessionSecurityTest.kt`, preserving
DiPlay's separate corner-mask, buffered-audio and bounded-parser behavior. It does not import
WheelPlay's incremental RTSP decoder, incomplete-message deadline, authentication assets,
projection plugins or system-privilege integrations. Scope and verification limits are recorded
in [the synchronization notes](UPSTREAM-SYNC-20261028.md#wheelplay-独立安全适配).

### Native WebRTC dependencies

WebRTC native dependencies use unmodified official sources pinned in
`browser/src/main/cpp/NativeDependencies.cmake`: libdatachannel and libjuice (MPL-2.0),
libsrtp and usrsctp (BSD-style), nlohmann/json and plog (MIT), and MbedTLS (Apache-2.0
option of its dual license). The build-only MbedTLS framework is Apache-2.0. Full
notices are in `docs/licenses/dependencies/` and in the APK's browser
`rtc-licenses.txt` asset, accessible through the page's Licenses link. NanoWSD uses
NanoHTTPD's existing BSD 3-Clause license. None of these libraries supplies MFi credentials.

## Download website

The static site layout, CSS and generator adapt DiAuto (AGPL-3.0). The AGPL license text is included with the source.

## BYD HUD maneuver icons

Required Notice: Copyright AndyShaman (https://github.com/AndyShaman/BYDMate)

The maneuver PNGs under `shared/src/main/assets/byd-hud-icons` were imported from BYDMate. Its PolyForm Noncommercial 1.0.0 terms and required notice are included alongside the assets. These files are separate from the project code license; upstream describes them as donor assets and their original provenance is not independently established. The validated DiLink5.1 windshield path uses factory turn codes rather than these images.

The 0.1.2 static-screen WebRTC watchdog and device diagnostics selectively adapt the
local changes to tepla in task `01a120db-3d51-73f2-a917-5882c000b655` (“检查 ADB 连接”).
They retain the existing GPL-3.0 reference attribution; the new browser layout and
bounded Android sampler live in the browser module. Hardware-specific root/hotspot
scripts, private HTTPS keys and VPN routing are not part of this migration.

The 0.1.3 V50 hotspot investigation also references that task's bridge-address fix.
The shared implementation uses observed bridge membership and AP/upstream evidence
to select an IPv4 hotspot endpoint; it does not assign eligibility from `br0` alone.
