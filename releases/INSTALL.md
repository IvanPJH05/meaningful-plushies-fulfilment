# MP Packing Station 2.2.0 — warehouse packing

Install the signed MP-Packing-Station-2.2.0.apk on the Galaxy Tab S9+. It updates the separate MP Packing Station app using the same permanent signing identity; keep app data and pending uploads.

USB startup first opens the camera to discover its advertised modes, then reopens at the highest supported recording resolution up to 2K. If a mode fails, it tries the next compatible mode before recording starts. The connected resolution is shown on screen. A failed camera during packing still stops the recording; it never changes resolution in the middle of a parcel.

1. Sign in with an active fulfilment staff account. Wait for CONNECTED.
2. Pair the Bluetooth barcode scanner in Android keyboard/HID mode with an Enter suffix.
3. Choose the tablet camera or USB webcam, allow camera and microphone access, and wait for READY. Choose microphone lists Android's available recording inputs, including supported USB inputs. Changing it reconnects the camera between parcels.
4. Audio for every current Sent for Sewing order is downloaded into private tablet cache with two downloads at a time. Wait for the ready counter for immediate local playback. The audio list refreshes automatically every minute and when returning to the app. Refresh order audio also retries unavailable recordings. Ordinary status and tracking edits keep the downloaded audio; replacing a recording invalidates its copy. Uncached orders still stream their audio on demand.
5. Scan the individual order barcode. Its code stays visible immediately, recording begins before the online lookup finishes, and cached audio starts without waiting. HID input is captured even when another station control has focus. Scans made during local video saving are retained in order for the next parcel. Scan its NFC barcode straight away; the app retains it while resolving the order. Another parcel cannot replace the active recording.
6. A successful NFC pair plays the correct tone over customer audio. Errors pause audio, play the wrong tone and spoken problem, then resume. Correct the NFC card without abandoning the active recording.
7. Pack the parcel and attach its shipping label. Show the complete J&T tracking barcode clearly to the selected camera. Two distinct consecutive frames must match the exact tracking number. A wrong label keeps recording and announces the mismatch.
8. A match ends the video, retaining microphone sound, and saves it privately on the tablet. The server rechecks the live tracking number, NFC ownership and cloud video before marking Packed. Upload retries do not mark Packed early. The next parcel can begin after local saving while cloud upload continues.

Recording has a three-minute safety limit. Missing tracking numbers, cancellation, microphone/camera failure, interrupted frames or incomplete sound do not produce a successful packing proof. Keep the packing screen open while recording and local saving. Finished uploads survive restarts and retry with WorkManager; older timed recordings already in the queue remain supported.

Microphone sound includes the room and customer audio played aloud through tablet speakers; headphone playback is not captured acoustically. The camera preview is silent to avoid feedback. Android must expose and permit the chosen input; the app reports a routing failure instead of silently selecting a different microphone.

Preview and recording retain camera aspect ratio and orientation. Rotate camera 90° retains the existing per-camera mount correction. USB webcam support stays on UVCAndroid 1.0.13. Shipping-barcode recognition uses the bundled ML Kit 17.3.0 model on the tablet; the barcode is not sent to a recognition service.

View saved proofs in the main fulfilment system under Order details → Packing videos. Customer tracking-video access rules are unchanged. The app contains no Supabase service key and uses active staff authentication and short-lived private-storage upload URLs.

CI compiles, lints, runs unit tests and exercises native camera/audio encoding on an Android emulator. A USB webcam and microphone still depend on the actual tablet, hub and hardware combination. The CI artifact is unsigned; sign with scripts/sign-packing-release.ps1 and the existing private release key outside the repository. Never replace or publish that key or its DPAPI-protected password.
