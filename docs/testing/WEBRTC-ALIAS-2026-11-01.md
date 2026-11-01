# WebRTC local gateway alias correction

The existing HTTPS gateway and WebRTC media used different socket binding policies.
libjuice advertised the host's address alias, but its any-address UDP socket replied to
incoming ICE checks using the primary LAN address. A browser restricted to the alias
could not complete the ICE connection. This issue precedes HEVC and applies to AVC too.

The Tesla output now resolves its saved HTTPS entry on the RTC worker and binds media
to a matching local IPv4 address. It checks actual local interfaces before binding;
an external proxy address, DNS failure or missing entry retains ordinary direct ICE.
The JNI bridge uses libdatachannel's existing `bindAddress` option. No dependency source,
hotspot, routing, TLS, DNS or firewall changes are required.

Two related corrections are included:

- An authenticated second page receives an explicit media-busy message, keeps its control
  socket alive, and joins after the current viewer leaves. It cannot mute or displace the
  current audio owner. A waiting JPEG page stops requesting or rendering JPEG frames.
- Encoded passthrough respects the saved HEVC preference without requiring an Android
  hardware decoder. Ordinary local head-unit playback retains the existing decoder guard.
  The initial HEVC preview enabled the preference but still encountered that older guard.

Browser failure reports now carry a fixed, validated reason into the Android diagnostic
log. No SDP, ICE password or arbitrary client text is written through this diagnostic path.
An idle server reports waiting rather than claiming JPEG playback.

## Device experiment

On 2026-11-01, a real rooted ZTE V50 (Android 13) sent a PC-generated 320×240 HEVC test
clip to isolated desktop Chrome 156.0.8078.74. The sender creates no Android video codec.
The production CarPlay application and gateway remained separate from the test service.

1. With normal ICE candidates, Chrome decoded 50 frames. This alone does not validate the alias.
2. With only the existing entry alias offered, ICE remained checking and decoded zero frames.
   A bounded packet capture showed checks addressed to the alias and replies from the LAN
   address. The instrumented playback assertion failed, as expected for this experiment.
3. After binding the socket to that alias, the same isolated path connected, Chrome decoded
   50 frames, and the instrumented test passed with zero calls into its JPEG sink.

An earlier test-script attempt produced invalid SDP while removing candidates; it was kept
separately and is not evidence of network failure. The corrected filter retains the complete
existing alias candidate and removes other candidate lines without changing their contents.

The device experiments validate the specific address mismatch and correction. They do not
prove Tesla firmware behavior, an actual iPhone HEVC profile, sustained high-resolution video,
or that this was the only cause of the owner's earlier vehicle connection failure. The vehicle
and iPhone were unavailable during diagnosis. No TURN server or UDP relay was added.

## Checks and installation

- Full workflow Android command, with `--continue`: 3,672 tests, 3,663 passed, seven failed,
  two skipped. The failures remain the three Windows symlink privilege cases and four
  FileProvider compatibility cases. No test was disabled. All requested lint and assemblies
  completed, including the signed Tesla release build and independent test APK.
- Browser Kotlin: 94 passed. Tesla Kotlin: 15 passed. The new host HEVC policy regression
  passed within the common suite. Node browser/proxy: 102 passed with local sockets and
  the installed OpenSSL available.
- Real Chrome UI checks passed, including compact Chinese, full English and narrow Arabic
  at font scale 1.3. The added busy-page scenarios verify a visible explanation, no waiting
  JPEG requests, and recovery when the media owner leaves.
- The signed local preview was installed on V50 with `adb install -r`. The installed APK
  hash, preserved preferences, gateway process and HTTPS assets were checked after updating.
  The separate synthetic-test package and temporary device backups were removed. No GitHub
  release was published. The next real vehicle session remains to be checked.

## Reproduction

Build `:browser:assembleDebugAndroidTest` and install its independent test APK. Run
`HevcPassthroughInstrumentedTest` with `-e bindAddress <existing-local-entry-ipv4>`.
During the test, connect Chrome to port 8098 using the synthetic token in the test source,
retain only that address's ICE candidate, and confirm actual decoded frames before sending
the fixture's `home` completion action. The test-only fixed UDP port is 40001; production
uses an ephemeral port. Raw captures, failed experiments and immutable receipts remain in
the ignored local diagnostic directories.
