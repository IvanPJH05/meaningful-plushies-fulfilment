# MP Packing Station 1.4.0

[Download the signed Android installer](./MP-Packing-Station-1.4.0.apk).

Install as an update over version 1.2 or 1.3. Keep app data and pending uploads. Sign in with your existing fulfilment staff account, choose the tablet or USB camera, and wait for READY.

- Scanning the order barcode immediately plays that order's audio.
- Scan the matching NFC barcode while the audio continues. Successful pairing plays the correct tone over the customer recording.
- An error pauses the recording, plays the wrong tone and spoken explanation, then resumes from the same position.
- The camera preview preserves the complete frame without stretching. Tablet orientation follows the screen; Rotate camera 90° adjusts the webcam mount and future saved clips.
- The order moves to Packed only after the matching card is paired and its complete packing video is verified online. Failed pairing, failed recording, and pending uploads leave its status unchanged.

The video retains 3 seconds before and 20 seconds after the matching scan. Completed recordings stay on the tablet until online saving is acknowledged. View saved footage in the fulfilment system under Order details > Packing videos. Keep the app open during recording and do not clear app data while uploads are pending.

Stop audio interrupts playback. Replay order audio restarts the matched recording. Android media volume controls both sound channels. Spoken alerts use an installed English Android text-to-speech voice, preferring offline voices; unavailable speech is reported on screen.

This release requires packing server protocol 2. It uses the same permanent signing identity as versions 1.2 and 1.3.

APK SHA-256: e8f1657a79e985a364f1b99bf08b221d9a9bf6a6fcc3cddf68a0fe593c5023b7

Signing certificate SHA-256: 19935661de88d56ab4ff563f36c87b132d8b87668b6b860920b540508f758308
