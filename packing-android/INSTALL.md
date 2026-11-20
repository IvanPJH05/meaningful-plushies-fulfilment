# MP Packing Station 1.2 — live Android app

Install MP-Packing-Station.apk on the Galaxy Tab S9+. This app runs beside the main fulfilment app.

1. Sign in with an existing active fulfilment staff or administrator account. Demo mode has been removed.
2. Wait for CONNECTED. Check connection verifies access to the live Supabase orders and private packing video storage through the authenticated fulfilment service.
3. Pair the Bluetooth scanner in Android keyboard/HID mode with an Enter suffix.
4. Tap Choose camera and select the tablet rear/front camera or USB webcam. Allow camera/USB access and wait for READY.
5. Scan the individual order or packing-slip barcode. The app reads that exact order and confirms its Packed update, regardless of previous stage.
6. Scan its matching ID-card barcode. The app checks or pairs the card, plays the order audio on the order scan, and saves 3 seconds before + 20 seconds after the matching scan. Card-first scanning is also supported.
7. Completed video sources are kept in private tablet storage until upload and server verification succeed. Finished videos appear in Order details > Packing videos in the main system. Retry uploads now resumes pending uploads. Sign in again if a session expires.

The app never contains the Supabase service key. Staff access is checked by the fulfilment server on each request. Video uploads use short-lived signed URLs to the private packing-proof bucket. Customer order attachments are excluded from the fast scanner response.

Keep the packing screen open while recording. Switching cameras is disabled during recording and local saving; choosing a different camera clears the previous rolling history. Leaving the app or disconnecting the camera cancels incomplete footage. Completed recordings survive restarts and retry when internet returns. Do not uninstall or clear app data while files are waiting to upload.

This internal release is non-debuggable and retains the existing 1.1 installation signing identity. The build service preserves its key between builds; do not remove its signing cache without arranging a replacement signing backup. No new customer tables or public database grants are needed.

USB camera support uses UVCAndroid 1.0.13; uploads retry with Android WorkManager 2.10.2. Tablet camera recording, camera switching, and native MP4 history are covered by Android instrumentation tests.
