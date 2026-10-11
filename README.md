# DiPlay Tesla

This fork adds a Tesla browser output to the existing Android CarPlay receiver. A separate
`tesla` APK composes the core with the `browser` library; the optional Node.js `proxy/`
process is deployed independently. Tesla and the Android host share a local network.

[Download complete 0.1.10 APK](https://github.com/WangZhuo2015/DiPlay-tesla/releases/tag/tesla-v0.1.10) · **[Installation and browser setup](docs/TESLA-QUICKSTART.md)** · [中文使用指南](docs/TESLA-QUICKSTART.zh-CN.md)

**Tested in a 2026 Model Y Juniper: CarPlay audio and touch work normally.** The Android
host is a **ZTE V50 mobile Wi-Fi**, with **iPhone 16 Pro Max and iPhone 17 Pro Max,
both on iOS 27.0.1**. This is the owner's confirmed setup; other combinations need
their own checks.

![Model Y Juniper vehicle photo with the address-bar domain redacted](docs/testing/tesla/model-y-juniper-v50-redacted.png)

Install `DiPlay-Tesla-0.1.10.apk` on the Android host, enable its hotspot and connect
the iPhone in DiPlay. Connect Tesla to that hotspot. Android **Settings → Connection →
Tesla browser (experimental)** shows the entry and six-digit pairing code. Open the
entry in Tesla and pair; this browser remembers the connection. Codes last five minutes.

The complete APK includes the explicitly provisioned experimental accessory identity
for local iPhone authentication, so end users do not need to compile it. It is not a new
Apple-issued DiPlay identity.
[Provenance and scope](docs/THIRD_PARTY_NOTICES.md#experimental-authentication-data)
are documented. Source archives and the independent proxy omit that identity, and the
Android signing private key stays local.

**Configure your own HTTPS entry separately.** Downloads and public files contain no
user domains, HTTPS certificates/private keys, hotspot passwords or device routing
configuration. Use the [rooted Android gateway](proxy/android-root/README.md) or the
[independent proxy](proxy/README.md) with your own domain, DNS and certificate. Android
can display the configured HTTPS entry. Routing is configured on Android/the gateway;
Tesla connects through the hotspot's default gateway.

**Tesla firmware can restrict private-IP access.** An HTTP address working on a phone
or computer does not establish vehicle access; a domain or HTTPS alone may not fix it.
Read the [private-IP entry notes](docs/TESLA-QUICKSTART.md#tesla-private-ip-access-restrictions)
and configure your own reachable gateway address, DNS and trusted certificate.

0.1.10 defaults browser music/navigation audio on and remembers manual disabling.
Tap the page when the browser requires interaction. The top-center menu handle retracts
after two seconds; virtual keys are hidden by default. The 0.1.9 touch fix preserves
release coordinates and orders press/release events, repairing dock/home activation.
Diagnostics use named thermal sensors and no longer show a misleading battery reading
on powered hosts.

Display presets offer Fit window, 720p, 1080p and 2K (up to 2560×1440), with 1/2, 3/4
and 1× Fit scaling. Right/full dimensions save independently and apply on the next
connection or an explicit Apply and reconnect. H.264 WebRTC is preferred with automatic
JPEG fallback. The menu groups actual transport, received dimensions, decoded fps and
readable SoC temperature. [Preset details and screen sources](docs/TESLA-DISPLAY-PRESETS.md)
include synthetic screenshots without real accounts, vehicles or private configuration.

![Synthetic compact menu and stream summary](docs/testing/tesla/browser-0.1.10-menu-compact-font130.jpg)

The Model Y Juniper test confirms working audio and touch on 0.1.10. Earlier V50 checks
also confirmed default audio and idle handle retraction. Calls, Siri voice and microphone
input still use Android; the page has no microphone capture. Sustained 2K performance and
voice were not separately validated in this report. [Release notes](docs/RELEASE-NOTES-TESLA-0.1.10.md)
and [vehicle validation](docs/testing/tesla/README.md#model-y-juniper-vehicle-report--2026-10-12)
record the scope.

[Technical/build guide](docs/TESLA.md) · [Independent proxy](proxy/README.md).
Normal source builds omit accessory authentication; standalone builds need authorized
external assets. The upstream DiPlay documentation follows. For this Tesla port, start
with the quick-start guide above.

**CarPlay for compatible BYD Android head units.** Wired and wireless, with the familiar DiAuto interface. Independent app: `com.shihab.diplay`.

> **BYD support scope:** These projects focus on BYD cars. They may work on other brands, but other brands are unsupported and there are no plans to add support or fix brand-specific incompatibilities.

[Download & website](https://shihabal3amri.github.io/DiPlay/) · [Release](https://github.com/shihabal3amri/DiPlay/releases/tag/v0.2.16) · [Report a problem](https://github.com/shihabal3amri/DiPlay/issues/new/choose)

![DiPlay home](site/assets/home.png)

## 0.2.16 — public preview

Install on the **car**, not the iPhone. No jailbreak, dongle, Mac, account or authentication server is required for use. Core CarPlay does not require ADB; optional dashboard, battery, wheel-speed and parked-video features do. Your head unit must permit APK installation. The APK supports Android 7.1+ (API 25); Android 7.1–8.1 support is not yet confirmed on a vehicle. Wireless supports Wi-Fi Direct, the car’s existing hotspot or Existing Wi-Fi / Same LAN. Android 7.1–9 Wi-Fi Direct uses a firmware-dependent legacy path with generated group credentials and unverified requested frequency; see [Android 9 Wi-Fi Direct](docs/ANDROID9_WIFI_DIRECT.md). Android 10+ verifies its negotiated group frequency.

- Wired USB and wireless CarPlay with local authentication.
- BYD HUD navigation with arrows, distance and street names on verified firmware.
- Car hotspot support, improved audio buffering and saved receive diagnostics.
- Automatic address discovery, fixed-channel Wi-Fi fallbacks and successful-configuration memory.
- Icon/text size, resolution and frame rate; applying a display change reconnects CarPlay.
- Local diagnostic export. Reports are sent only if you choose to share them.
- Separate installation alongside DiAuto. Run one projection app at a time.

This is **not an Apple-certified product**. The APK bundles an experimental accessory identity recovered from public Carlinkit firmware, not a newly provisioned MFi identity for DiPlay. Acceptance after future iOS updates, reliability across head units and suitability of that identity for general distribution are unresolved. This release invites community testing; it is not a guarantee of universal compatibility.

Earlier releases were tested on the development DiLink5.1 car: live windshield guidance and street names work, Car hotspot now starts CarPlay, and Wi-Fi Direct performance is substantially improved. Audio underrun recovery is improved in 0.2.15; remaining cutouts need current diagnostic reports. The 0.2.16 software Opus microphone fallback was accepted on a BOS Mini A1 head unit (Android 9) with an iPhone 12 on iOS 27. The floating-map test build was installed on the development DiLink 5.1 car; feedback led to the pinch corrections in 0.2.9. Earlier wheel-speed and video contributions were tested on a BYD Tang with DiLink 5.0 and an iPhone 15 Pro on iOS 27; wheel-speed dead reckoning in tunnels remains unverified. Broader head-unit and iOS compatibility is not guaranteed. The HUD firmware scope and cleanup limits are documented in [BYD navigation](docs/BYD_NAVIGATION.md).

## What’s new in 0.2.16

- Siri and wireless calls send the microphone on Android 7.1–9 head units without an Opus encoder, using a bundled software Opus encoder.
- Wired USB fixes for NCM framing and Android 8 reads, with smaller-read retries when a head unit rejects a large read.
- Wireless recovery: hotspot address refresh after a first-connection timeout, Android 17 local-network permission, VPN-authorization crash handling and WPA3 car-hotspot security.
- Experimental Low-latency decoding and Direct video output, an FPS counter in Diagnostics, and bounded video backlog recovery.
- Inline Settings search, a confirmation before the quick menu discards unapplied changes, and an Off option for the CarPlay swipe-down gesture.
- 1% dashboard marker sliders, separate small-window turn-card placement, a resizable side panel and a themed cluster waiting screen.
- Experimental, off-by-default vehicle options: car Bluetooth pause during CarPlay, music-following ambient lighting, navigation wheel volume and a Platform 21 instrument route.

See [0.2.16 release notes](docs/RELEASE-NOTES-0.2.16.md) and [validation](docs/VALIDATION.md) for contribution links and remaining physical tests. General stutter, calls/Siri, decoder and model-specific reports still need current-device evidence. [0.2.15 notes](docs/RELEASE-NOTES-0.2.15.md) remain available as historical guidance.

If a problem remains, reproduce it on **0.2.16**, then use **Settings → Diagnostics → Save diagnostic report**. Android 10+ normally saves to **Downloads/DiPlay**; Android 7.1–9 uses the document picker. If unavailable, use **View report** or **Share** from the confirmation, which identifies external/private fallback storage. Review the `.txt` and add it to a matching [existing issue](https://github.com/shihabal3amri/DiPlay/issues), or [create one](https://github.com/shihabal3amri/DiPlay/issues/new/choose). Include vehicle/head-unit model, exact firmware and Android/DiLink, phone/iOS, connection backend, relevant settings, steps and failure time. Reports are shared only when you choose; never post your hotspot password.

## Documentation

[Existing Wi-Fi / Same LAN](docs/EXISTING_WIFI.md) keeps the iPhone and head unit
on an external router. See the guide for setup, build requirements and the
BYD DiLink 4.0 / Android 10 clean-install validation result.

- [Install and connect](docs/INSTALL.md)
- [Compatibility and troubleshooting](docs/COMPATIBILITY.md)
- [Smooth wireless CarPlay](docs/SMOOTH_WIRELESS.md)
- [Privacy and diagnostic reports](docs/PRIVACY.md)
- [Build from source](docs/BUILD.md) — select `mobile` for the main DiPlay app; `maphost` is a map sample.
- [Validation](docs/VALIDATION.md)
- [Release notes](CHANGELOG.md)
- [Credits and licenses](docs/THIRD_PARTY_NOTICES.md)

The app and release website are available in English, Arabic, Russian, Ukrainian, Spanish, Simplified Chinese and Traditional Chinese (Taiwan). Traditional Chinese uses Taiwan wording; the app also recognizes Hong Kong/Macao and explicit Hant selections without claiming separate regional translations. Choose the app language in Settings; on Android 13+, it stays synchronized with Android’s per-app language setting.

## Source and credits

Based on [xcertplay](https://github.com/shilapi/xcertplay), GPL-3.0. The home/settings UI and website adapt [DiAuto](https://github.com/shihabal3amri/DiAuto), AGPL-3.0; that license is included in `docs/licenses`. Preserve those notices when distributing modifications. CarPlay and its icon belong to Apple Inc.; no Apple or BYD affiliation or endorsement is implied.

This repository starts with a clean public source snapshot. Local research, tester reports and release-signing secrets are excluded. The complete source corresponding to the APK is provided with every release; experimental runtime identity assets are described separately in the build instructions and notices.

## Local release packaging

Standalone builds explicitly select an authorized external asset directory and contain the experimental accessory identity. The public Tesla 0.1.0/0.1.1 APKs and source/CI builds omit it. The Git repository and source archive exclude all accessory and Android signing keys; tests generate synthetic identities at runtime.
