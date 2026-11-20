# Meaningful Packing Station - Android tablet test

This installs beside Meaningful Fulfilment; it does not replace that app.

1. Copy `meaningful-packing-station-test.apk` to the Galaxy Tab S9+ and open it. Android may ask you to allow installation from the app used to open the APK.
2. Pair the Bluetooth scanner in Android Settings. Use keyboard/HID mode and enable its Enter/Return suffix.
3. Connect the USB-A webcam through your USB-C dongle.
4. Open **MP Packing Station** and select **Test webcam and scanner - demo only** first. Tap **Choose camera**, select the tablet rear/front camera or a USB webcam, allow camera and (for USB) USB access, and wait for **READY**.
5. Scan/type `MPDEMO1001`, then `NFC-100001`. Keep the packing scene in view during the countdown. Use **Play last demo video** to inspect the local test. Demo mode never contacts live orders or uploads its files.
6. Exit demo and sign in with your existing fulfilment staff account. Scan the individual order barcode, then its matching ID-card barcode. Either barcode can be scanned first. The order scan marks it Packed using the existing system rules; the matched card scan secures the packing video.

The native recorder maintains recent video before the scan. It writes an MP4 source on the tablet; the existing server prepares the exact 3 seconds before + 20 seconds after and attaches the verified clip to that order. View the result in the fulfilment system under **Order details -> Packing videos**.

Completed recordings stay in private app storage until cloud saving is confirmed. Uploads retry when the network returns and can continue through Android's background job system. If sign-in expires, sign in again to resume. Do not uninstall the app or clear its data while videos are waiting to upload.

Keep the packing screen open during recording. Leaving the app, disconnecting the webcam, or an interrupted camera feed cancels incomplete footage; it is never reported as saved. The screen stays awake while the app is open. Only camera access is requested; the Bluetooth scanner acts as a keyboard, and microphone access is not used.

This first APK is test-signed. Its USB webcam connection still needs checking on the actual tablet/dongle/webcam combination using the built-in demo. It does not change the main app, backend code, database permissions, or customer records during testing.

USB webcam library: [UVCAndroid 1.0.13](https://github.com/shiyinghan/UVCAndroid), Apache-2.0 (with native component notices in the upstream project). Android WorkManager 2.10.2 is used for retrying uploads.

Version 1.1 adds tablet front/rear cameras in the same camera chooser. Changing cameras resets the rolling history; wait for READY again. Camera selection is locked during an active capture or while saving its local file.
