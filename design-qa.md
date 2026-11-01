# Remote host experience QA

final result: passed

## Target and scope

Selected image: option 3, `agent_docs/design/tesla-host-20261031/03-pairing-workspace.png`.
This change applies its visual language to the existing native Android application and
production Tesla browser assets; it does not create a separate web imitation of the APK.

The source is 853 × 1844 pixels, approximately 390 × 844 logical pixels. Native reference
captures use 390 × 844 dp at density 2, Chinese, dark theme, iPhone connected and browser
waiting, with synthetic example address and code. Reference and actual Activity capture
were opened together in one comparison input. No device chrome is included in either.

## Findings and fixes

- P2, fixed: the original single-line code view used an oversized horizontally scrolling
  text layout. RTL could hide the code. It now uses one bounded line, disables horizontal
  scrolling and sizes the text to the available width. Bounds are asserted in screenshot tests.
- P2, fixed: locale direction was not explicit in the component screenshot fixture. Rows,
  columns and text now follow the locale, with URL/code direction kept LTR and chevrons mirrored.
- P1, fixed: the visual redesign initially omitted phone change, USB and disconnect actions.
  The phone card now opens those existing actions. Saved automatic connection behavior is retained.
- P2, fixed: an existing session could send a resumed Tesla launcher to the local projection
  screen. Both initial and resumed launcher paths now keep this product on its host dashboard.
- P2, fixed on V50: changing setup steps retained the old scroll offset. Forward and back actions
  now start each step at the top. A 320-dp Activity regression test and a four-step device walkthrough
  verify the fix.
- Browser gate resolved: the user explicitly authorized local Chrome. Both existing browser suites
  passed; pairing error recovery and successful pairing were added to the fixture checks.
- Capture correction: Material button state animations are settled before software bitmap capture.
  The final real-Activity capture now includes the settings button, rather than its initial animation frame.

## Required fidelity surfaces

- Typography: native sans-serif bold hierarchy and locale fonts; the URL remains selectable,
  the code scales to width, normal copy wraps. Font scale 1.3 is included in compact/full/RTL captures.
- Spacing: shared named dp constants for Android, named CSS tokens for web; controls share a
  minimum height and radius rule. Native content is centered and clamped to 720 dp on wide windows.
- Colors: the existing DiPlay dark palette supplies blue-black backgrounds, blue primary actions,
  green iPhone state and amber browser waiting state. Existing light appearance remains supported.
- Assets: official Google Material outlined icons, with pinned provenance and Apache notice.
  The generated concept is a visual reference, not a screenshot used as the app UI.
- Copy: the HTTPS annotation is an intentional addition to the source concept. It says an entry
  is configured, never that a gateway is running or vehicle reachability is verified. All new
  `settings_*` text is translated across the existing locales.

Acceptable adaptations: native platform font rendering, library icons, accessible control sizes,
and the explicit HTTPS annotation. No remaining P0/P1/P2 design issue was found.

## Evidence and checks

- Native captures: `common/build/reports/remote-host-ui/` (including the real DiPlayActivity).
- Focused tests: `agent_docs/tesla-host-ui-20261031/native-integration.log`.
- Node tests: 99 passed, `agent_docs/tesla-host-ui-20261031/node-tests.log`.
- Complete final Android CI invocation: `agent_docs/tesla-host-ui-20261031/v50-final-ci.log`.
  3,662 tests: 3,636 passed, 24 failed, two skipped. Failures comprise the original seven Windows
  symlink/FileProvider failures plus 17 SettingsBackupServerTest socket-connect failures
  (`Address already in use`). A separate run of all 30 backup-server tests passed 29 and failed
  the 3,000-connection stress case with the same socket error. Windows had 15,503 TIME_WAIT
  sockets in a 16,384-port dynamic range. This is not a green CI run. Historical full and isolated
  logs are retained; no tests were disabled and no host network settings were changed.
  All requested lint, debug assembly, standalone release assembly and release lint tasks passed.
- Eleven host-flow/screenshot tests passed in the final full run, including the new scroll regression.
  Focused tests plus translations passed in `v50-scroll-fix.log`. The 390-dp reference, compact/full
  large-font, RTL home and RTL setup screenshots were visually inspected; no remaining native P0/P1/P2
  issue was found. Stable copies are in `agent_docs/tesla-host-ui-20261031/native-final/`.
- Public source check includes new files and passes; no private gateway settings or credentials
  were added.

## Browser verification

Chrome 156.0.8078.74 ran the production assets with synthetic HTTP/signaling and real local RTC
loopback in the existing scripts. Compact Chinese, full English and narrow Arabic captures use
font scale 1.3. Pairing, invalid-code recovery, volume persistence, host-volume synchronization,
conflict recovery, display settings, focus behavior and RTC/JPEG recovery checks passed.
Screenshots in `browser-ui/` and `feedback-ui-final/` were opened and inspected. The selected
Android visual is the style reference; browser routes have different content and viewport proportions.
Palette, typography, surfaces, control sizes and spacing were compared without claiming a pixel clone.

The real installed V50 APK was also paired through its existing trusted HTTPS gateway in Chrome.
The real status API, primary menu, advanced sound controls and display settings loaded with zero
page errors. Real-device captures use the page's normal font size and preserve its strict CSP.
No iPhone was connected during this browser check, so this does not verify actual CarPlay media.

## V50 installation and state

The ZTE V50 runs Android 13 at 480 × 854 pixels / 200 dpi. Its reported 90-pixel display cutout
is respected. The current automatic appearance produces the light variant; dark reference rendering
was verified separately. The source build was signed with the installed release certificate and
installed with `adb install -r`. Version is 0.1.13 / code 14, a local UI preview rather than a new
GitHub release. The installed APK was pulled back and its SHA-256 matched the final build.

The old 0.1.10 APK and application data are backed up under the ignored private device-run folder.
Pairing token, phone/network preferences and HTTPS metadata remain intact; interface IP addresses
and the gateway process are unchanged. The user confirmed changing the full-screen profile during
inspection and explicitly requested retaining that current value. Diagnostic changes are retained.
Four setup steps were captured on-device after the scroll fix, and the application was returned home.

## Scope limits

- Vehicle firmware/network/audio behavior needs a separate real-device check; no claim is made
  about the Tesla browser or an iPhone media session from this V50/Chrome validation.
- Full Android CI remains red for the explicitly recorded Windows failures above. Visual QA passing
  does not override those test results.

## HEVC follow-up — 2026-11-01

HEVC passthrough and the explicit manual JPEG policy were added after the V50 UI installation.
The existing Advanced control now uses a Tesla-specific experimental title and next-connection
description in every locale; it retains the same persistence. Browser rejection messages were
inspected at full, compact and Arabic RTL viewports with font scale 1.3. They open the menu and
explain the H.264 rollback without leaving an unexplained blank video surface. No remaining
P0/P1/P2 visual issue was found. The source design remains the style reference, with diagnostic
copy added for this new functional state.

The final follow-up CI run had 3,668 tests: 3,659 passed, seven failed and two skipped; lint and
all requested assemblies passed. Both browser suites, 101 Node tests and the real Android-native
HEVC-to-Chrome decode check passed. The earlier full/isolated failure records above are retained
as historical runs. See [HEVC verification](docs/testing/HEVC-PASSTHROUGH-2026-11-01.md).

The owner chose code and APK delivery while V50 was offline. This HEVC package has not been
installed on V50, and neither iPhone HEVC output nor Tesla HEVC reception is claimed.

## WebRTC alias follow-up — 2026-11-01, after installation

The later installation and diagnosis supersede the device-availability statement in the
earlier run above. V50 is online and now has the local WebRTC correction installed with
its 39 existing preference values, HTTPS metadata, address configuration and gateway process
preserved. Packet capture isolated an alias/source-address mismatch. Binding the sender to
the existing alias changed a zero-frame ICE failure into 50 decoded frames on real desktop
Chrome; the independent Android test passed without an Android video codec.

The new media-busy state was captured at compact Chinese, full English and narrow Arabic
with font scale 1.3. The copy uses the existing menu flow and spacing, stops background JPEG
requests while occupied, and clears when the lease becomes available. Real Chrome checks
passed alongside 102 Node tests. The complete Android run had 3,672 tests with the same
seven recorded Windows failures and two skips; requested lint and builds completed.
See [the diagnosis and validation](docs/testing/WEBRTC-ALIAS-2026-11-01.md).
An actual iPhone/Tesla media session still awaits owner testing.
