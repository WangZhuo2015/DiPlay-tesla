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
