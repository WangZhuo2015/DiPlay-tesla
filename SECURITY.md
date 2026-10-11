# Credentials and release packaging

Public release distribution has resumed at the maintainer's request. The APK intentionally bundles the shared experimental accessory identity described in docs/THIRD_PARTY_NOTICES.md. A shared identity distributed in an application must not be treated as a confidential per-user secret. Removing it from Git history does not revoke previously distributed copies.

The public Git tree and corresponding source archive exclude accessory keys and Android release-signing secrets. CI checks reject credential containers and private-key blocks in tracked files. Synthetic test identities are generated at runtime. Source builds have no automatic private-asset import; release packaging requires an explicit local directory and permits only the two expected runtime files.

The Android APK-signing key is separate, stays local and is never bundled in the APK. Current acceptance of the experimental accessory identity does not establish Apple certification or guarantee future compatibility.

Review diagnostic reports before posting. Never include credentials or pairing records in public issues. Use GitHub private vulnerability reporting for sensitive findings.
