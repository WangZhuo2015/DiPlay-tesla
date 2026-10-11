# DiPlay Tesla quick start

Install DiPlay Tesla on an Android host, connect your iPhone to that host, and open CarPlay in the Tesla browser. This guide covers **0.1.10**.

[Download 0.1.10](https://github.com/WangZhuo2015/DiPlay-tesla/releases/tag/tesla-v0.1.10) · [中文完整步骤](TESLA-QUICKSTART.zh-CN.md) · [Technical and build guide](TESLA.md)

## Choose the download

| File | Purpose |
| --- | --- |
| `DiPlay-Tesla-0.1.10.apk` | Complete Android receiver with the explicitly provisioned experimental accessory identity; no compilation needed |
| `DiPlay-Tesla-Proxy-0.1.10.zip` | Independent gateway source, HTTPS templates and configuration generator |
| `SHA256SUMS.txt` | SHA-256 checksums for both files |
| GitHub Source code archives | Source only; normal builds omit accessory authentication |

The APK requires Android 7.1+ (API 25+) and permission to install APKs. Android 7.1–8.1 and other hosts still need hardware validation. Install on the Android host. Package `com.diplay.tesla` updates an existing release with the same signing certificate, preserving settings; avoid uninstalling first. Debug builds use a separate package and separate settings.

## Connect the iPhone

1. Install and open the APK. Grant Bluetooth/Nearby devices and other requested connection permissions. Older Android may require location permission. Microphone permission is for the Android call/Siri route.
2. Enable the Android host's hotspot, preferably 5 GHz where supported. In **Settings → Connection → Connection setup → Built-in car hotspot**, save that host's exact SSID and password.
3. Keep iPhone Bluetooth and Wi-Fi enabled. Pair the iPhone with the Android host in iPhone Bluetooth settings. Select it in DiPlay, tap **Connect phone**, and accept any iPhone CarPlay prompt.
4. Wait for the Android connection status to show an active session. The Tesla variant outputs video to the browser without duplicating the full video decode on Android.

The V50 wireless arrangement was tested. Other hosts may lack the radio/firmware support to run the required networks concurrently. A USB data cable or [Existing Wi-Fi / Same LAN](EXISTING_WIFI.md) through an external router is an alternative. USB may request a local VPN permission.

## Configure your own HTTPS entry

**The downloads contain no user's HTTPS domain, certificate, certificate private key, hotspot password or device routing configuration.** A new host needs a gateway configured separately. Existing deployments can keep their entry after an APK update, but should check the actual upstream port.

- On a rooted Android hotspot host, follow the [Android HTTPS gateway guide](../proxy/android-root/README.md).
- On another device with Node.js, follow the [independent proxy HTTPS guide](../proxy/README.md#https-browser-gateway-011).

Supply your own domain, DNS resolution, browser-trusted certificate chain and private key. In Android **Settings → Connection → Tesla browser (experimental)**, read the actual HTTP port: DiPlay tries 8080–8089 when firmware occupies the preferred port. Configure the local gateway upstream as `http://127.0.0.1:PORT`.

For the Android gateway, install Caddy for the host architecture, generate your configuration from `proxy/android-root/config.example.json`, validate and deploy it, then install the generated HTTPS-origin metadata. Caddy is downloaded separately. Node.js runs the generator on the computer; it is not required on Android. Metadata changes the displayed URL and does not create DNS or TLS service.

Template domains and addresses are placeholders. Keep real configurations and certificates in local ignored storage. Renew certificates and restart the gateway as described in its guide. Route/address setup takes place on Android or the gateway. Tesla connects to the hotspot and opens `https://YOUR-DOMAIN` (add `:PORT` for a nonstandard port); no Windows or Tesla route editing is part of deployment.

The APK server itself uses HTTP. Replacing `http://` with `https://` cannot enable TLS. Direct HTTP can help troubleshoot a trusted LAN, but Tesla firmware may restrict it. HTTPS certificates and the iPhone accessory identity serve separate purposes.

## Open and pair the browser

1. Connect Tesla to the Android hotspot or another network that can reach the host and supply internet access. Keep DiPlay running.
2. On Android open **Settings → Connection → Tesla browser (experimental)** to see the entry URL and **six-digit pairing code**. You can also copy a link containing the short code.
3. Open the entry in Tesla and enter the code. It lasts five minutes; reopen the Android connection dialog after expiry or five incorrect attempts.
4. The browser remembers pairing. Clearing browser storage, reinstalling the Android app or switching HTTP/HTTPS origins can require pairing again. Do not share codes or copied pairing links.
5. “Waiting for CarPlay” means the page is reachable but the iPhone session is not active. Complete the iPhone connection first. Reopen the URL if the browser is stuck on an old connection-error page.

## Set the window and audio

Use Tesla's own controls to choose the right-hand window or full screen. Tap the **top-center handle → Display settings**, select the matching right/full profile and start with **Fit window · 1/2**. Half width and height use one quarter of the pixels. Other options are 3/4, 1×, 720p, 1080p and 2K (up to 2560×1440).

Presets retain the actual window aspect ratio. Right/full dimensions save independently; frame rate is shared. Saving applies to the next iPhone connection. Choose **Apply and reconnect** explicitly to apply immediately. Updating the APK does not automatically change an existing canvas to 1/2. Selecting a profile does not change Tesla's system window mode.

**Browser audio defaults on.** Play music and tap the page if browser policy needs a user gesture. A previous manual off preference is remembered: reopen the menu and enable **Browser audio (experimental)**. Music/navigation use browser PCM; the default buffer is 200 ms. Try 400 ms for interruptions, with increased delay, or compare 80 ms when stable. Keep the page in the foreground; losing the browser audio route returns subsequent audio to Android.

Calls, Siri voice and microphone input still use the Android host. The web Siri key can initiate Siri, but the page does not collect or return microphone audio. Hosts without working audio/microphone hardware cannot establish call support from browser music playback alone.

The menu handle retracts after about two seconds; tap its visible top-edge strip to reopen. Virtual keys are hidden by default. The menu groups actual video transport, received dimensions, decoded fps and readable SoC temperature; detailed diagnostics retain thermal sensor names. Static scenes can have zero decoded fps. Requested fps and detected viewport dimensions are not physical panel specifications.

![Synthetic compact menu, without real CarPlay or private configuration](testing/tesla/browser-0.1.10-menu-compact-font130.jpg)

## Troubleshooting and tested scope

| Symptom | Check first |
| --- | --- |
| HTTPS does not open | Hotspot connection, your DNS, gateway process, valid certificate chain and actual upstream port |
| Pairing code expires | Reopen the Android Tesla browser dialog for a new code |
| Page waits for CarPlay | iPhone connection, Android permissions, hotspot details and Bluetooth pairing |
| Accessory authentication fails | Use the complete 0.1.10 APK; 0.1.0/0.1.1 and source-only builds omit the identity |
| Picture works without sound | Play music, tap the page, check the remembered off preference, menu audio state and vehicle volume |
| Audio breaks up | Keep the page foreground and try 400 ms buffering; change one setting at a time |
| Picture is blurry or delayed | Check the active profile, start with Fit 1/2 at 20 fps; compare 720p/15 fps on slower hosts |
| JPEG instead of WebRTC | Automatic fallback can follow unsupported H.264 or failed WebRTC; browser and Android need direct connectivity, since HTTPS proxy does not relay UDP |
| Dock icons animate without activating | Update to 0.1.10 and reload the page; the gateway must serve the current APK assets |

Use browser live diagnostics and Android **Settings → Diagnostics → Save diagnostic report**. Remove private data, hotspot passwords and pairing information before sharing.

The APK was installed on V50 with a wireless iPhone. The owner confirmed default HTTPS audio and a retracting handle; the earlier 0.1.9 HTTPS test confirmed dock activation and continuous picture/audio. The target is a 2026 Model Y Juniper, but these reports did not separately identify the client model or validate sustained 2K output, calls or Siri.

The complete APK includes an explicitly provisioned experimental identity, not a new Apple-issued DiPlay identity. Recipients can extract its accessory private key. [Provenance](THIRD_PARTY_NOTICES.md#experimental-authentication-data) and [validation](testing/tesla/README.md#0110-default-audio-and-retracting-menu--2026-10-11) describe the scope. APK signing private keys and user HTTPS private keys are not distributed. Perform setup and checks while parked.
