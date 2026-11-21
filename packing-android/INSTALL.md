# MP Packing Station 1.4 — live Android app

Install the signed MP-Packing-Station-1.4.0.apk on the Galaxy Tab S9+. This app runs beside the main fulfilment app.

1. Sign in with an existing active fulfilment staff or administrator account. Demo mode has been removed.
2. Wait for CONNECTED. Check connection verifies access to the live Supabase orders and private packing video storage through the authenticated fulfilment service.
3. Pair the Bluetooth scanner in Android keyboard/HID mode with an Enter suffix.
4. Tap Choose camera and select the tablet rear/front camera or USB webcam. Allow camera/USB access and wait for READY.
5. Scan the individual order or packing-slip barcode. The app reads that exact order and keeps its current status.
6. Scan its matching ID-card barcode. The app checks or pairs the card, plays pairing feedback before the order audio once both scans have been checked, and saves 3 seconds before + 20 seconds after the matching scan. Card-first scanning is also supported.
7. The order moves to Packed only after the matching card is paired and the complete video is verified in private online storage. A failed recording, failed pairing, or pending upload leaves the order status unchanged. Completed video sources are kept in private tablet storage until upload and server verification succeed. Finished videos appear in Order details > Packing videos in the main system. Retry uploads now resumes pending uploads. Sign in again if a session expires.

The app never contains the Supabase service key. Staff access is checked by the fulfilment server on each request. Video uploads use short-lived signed URLs to the private packing-proof bucket. Customer order attachments are excluded from the fast scanner response.

Keep the packing screen open while recording. Switching cameras is disabled during recording and local saving; choosing a different camera clears the previous rolling history. Leaving the app or disconnecting the camera cancels incomplete footage. Completed recordings survive restarts and retry when internet returns. Do not uninstall or clear app data while files are waiting to upload.

This internal release is non-debuggable and uses a permanent private release key stored on the owner’s computer, outside this repository. It replaces the old disposable test signing identity, so finish pending uploads before uninstalling an old test version if Android cannot update it. Future signed releases must use this same permanent key. No new customer tables or public database grants are needed.

The CI artifact is deliberately unsigned. The owner signs it using scripts/sign-packing-release.ps1 and the verified Android build tools. The password is protected with Windows DPAPI. Back up the private signing folder securely; never publish its key or password.

USB camera support uses UVCAndroid 1.0.13; uploads retry with Android WorkManager 2.10.2. Tablet camera recording, camera switching, and native MP4 history are covered by Android instrumentation tests.

Pairing audio: a successful match plays the correct tone, then the matched order voice recording. A rejected pair plays the wrong tone, reads a short problem explanation, then plays the recognised order voice. No recording plays for an unrecognised order. The next barcode is held until feedback finishes; Stop audio lets staff interrupt, and Replay order audio repeats the matched order recording. Tablet media volume must be audible. Spoken problems use an installed English Android text-to-speech voice, preferring an offline voice. The 3+20 video recording starts at the scan and is independent of audio playback.

Packing completion uses server protocol 2. Pairing never marks the order Packed; the server rechecks the card and cloud file and commits the Packed update with the ready video record in one transaction. Upload retries cannot re-pack a later shipped order. Older app versions must be replaced with this update.
