# MP Packing Station 2.2.0

[Download the signed Android installer](./MP-Packing-Station-2.2.0.apk).

Install over the existing MP Packing Station app between parcels. Do not uninstall or clear app data while uploads are pending. The permanent signing identity is unchanged.

- Scanner input is captured across the packing screen even when another control has focus. Scans arriving while the preceding video is saved locally are kept in order for the next parcel.
- Audio preloading follows Daily Production's sewing queue, including orders whose older fulfilment status differs. Standalone Sent for Sewing orders are also included without duplicates or a fixed queue-size limit.
- The tablet checks for newly queued orders every minute and when returning to the app. Tracking/status edits keep downloaded audio valid; replacing the recording changes its cache version.
- Recording quality targets 8 Mbps above 1080p, 6 Mbps at 1080p and 4 Mbps at 720p. Native H.264/AAC warehouse proofs retain their original resolution and decoded picture pixels when saved online.
- The video records from the order scan until the camera verifies the matching J&T label. Microphone selection, camera rotation, instant NFC scans and order-audio playback remain available.
- Orders become Packed only after NFC pairing and verified cloud saving both succeed.
- Larger videos stay in private storage and retry safely from the tablet. The three-minute recording safety limit remains; the file limit is now 200 MiB.

After updating, check the header says 2.2.0, press **Refresh order audio** once, and wait for the recordings to finish preloading. Reconnect the camera and microphone, then test one parcel with consecutive order and NFC scans. Recordings not yet downloaded can still load when scanned. USB 2K performance depends on the tablet, webcam and hub; the emulator cannot verify that hardware combination.

See [installation and workflow details](./INSTALL.md).

Signing certificate SHA-256: 19935661de88d56ab4ff563f36c87b132d8b87668b6b860920b540508f758308

APK SHA-256: ee32d7983302d219654b611a239b60f8c68eed69d5aab749ec3c975d771a7be9
