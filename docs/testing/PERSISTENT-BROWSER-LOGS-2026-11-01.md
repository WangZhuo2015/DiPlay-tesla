# Browser diagnostics retained without a connected computer

The Tesla development preview writes browser/WebRTC history into the Android application's
private `files/browser-logs` directory automatically. The current file and seven archives
retain about 4 MiB. Starting the application again appends to that history; it does not reset
or rotate it just because the process changed. Oldest files rotate when the size limit is
reached. Exporting reads the history without clearing it.

Records contain timestamps with UTC offsets and Android uptime, process/install metadata,
authenticated browser attachment and media-busy states, requested/actual codec, offer/answer
candidate counts, media binding policy, connection state, first rendered frame, periodic
source and browser counters, and validated stop reasons. Browser counters include decoded
and dropped frames, received bytes/packets, dimensions and candidate kind/family. Unknown
metrics remain unknown. Healthy source/browser summaries are limited to one per 30 seconds.

Writes use the existing bounded asynchronous diagnostic writer and redaction rules. Full
SDP, ICE passwords, pairing credentials, addresses and media content are not retained in
these records. Client strings are reduced to fixed labels or bounded numeric fields.

The history is included in the existing Android **Settings → Diagnostics → Save diagnostic
report** action and the phone report export. No additional capture switch or computer is
needed during a vehicle session. Remember the approximate problem time and export after
returning home. Clearing application data or uninstalling removes private history.

## Verification

- Complete workflow Android command ran with `--continue`: 3,676 tests; 3,667 passed, seven
  failed, two skipped. The failures are the previously recorded three Windows symlink
  permission and four FileProvider compatibility cases. Requested lint/build tasks completed,
  including the signed Tesla APK. No existing failing test was disabled or rewritten.
- New persistence/export tests verify reopening, non-destructive exports, redaction and size
  rotation. Browser tests verify signaling summaries omit credentials and addresses and
  reject arbitrary diagnostic text. Browser Kotlin: 96 passed; Tesla Kotlin: 15 passed.
- Node browser/proxy: 103 passed. Real Chrome UI/RTC and feedback suites passed, including
  received-counter reporting, pairing, media occupancy and manual JPEG behavior.
- On the real V50, the signed preview was installed preserving data. An authenticated visit
  to the production HTTPS page created a retained hello/attach/detach sequence. The application
  was stopped and restarted while CarPlay was inactive. The same records survived, alongside
  startup records with two distinct Android process IDs.
- The V50 UI's existing Save diagnostic report action created a 1,593,863-byte report in
  Downloads/DiPlay containing the pre-restart browser history. The known pairing secret was
  absent. This validates actual on-device export, beyond an in-memory or unit-test result.
- Installed APK SHA-256:
  `287490326c65b9df9f6e528a7f6ac9d2d4a1d942d48955fcb6b86e0df4cd11da`.
  All 39 old preference values, HTTPS metadata, gateway process and address configuration
  were retained. Production HTTPS served the current assets after installation.

This run generated browser records without an active iPhone/Tesla session. The next vehicle
session will supply the real media evidence. Raw reports, backups and receipts remain in
ignored private diagnostic directories. No GitHub release was published.
