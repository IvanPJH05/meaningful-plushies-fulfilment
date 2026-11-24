# MP Packing Station 2.1.1

[Download the signed Android installer](./MP-Packing-Station-2.1.1.apk).

Install over the existing MP Packing Station app between parcels. Do not uninstall or clear app data while uploads are pending. The permanent signing identity is unchanged.

- Fixes version 2.1.0 rejecting a webcam before its resolution list was available. The app first opens the camera to discover its modes, then selects the highest supported recording mode up to 2560 × 1440. Failed modes fall back before recording begins; the actual connected resolution is verified and shown on screen.
- Recording quality targets 8 Mbps above 1080p, 6 Mbps at 1080p and 4 Mbps at 720p. Native H.264/AAC warehouse proofs retain their original resolution and decoded picture pixels when saved online.
- The video records from the order scan until the camera verifies the matching J&T label. Microphone selection, camera rotation, instant NFC scans and order-audio playback remain available.
- Orders become Packed only after NFC pairing and verified cloud saving both succeed.
- Larger videos stay in private storage and retry safely from the tablet. The three-minute recording safety limit remains; the file limit is now 200 MiB.

After updating, reconnect the USB webcam. Its connection message shows the actual negotiated resolution. Test one physical parcel and inspect its saved video in Order details → Packing videos. USB 2K performance depends on the tablet, webcam and hub; the emulator cannot verify that hardware combination.

See [installation and workflow details](./INSTALL.md).

APK SHA-256: 19646cc18aaf248b02153321dbab9af54bb0f04f5eb3ef6ace2497752c98114a

Signing certificate SHA-256: 19935661de88d56ab4ff563f36c87b132d8b87668b6b860920b540508f758308
