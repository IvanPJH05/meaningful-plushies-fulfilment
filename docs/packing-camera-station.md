# Packing videos

In Daily Production → Barcode Scanner, click **Start webcam**, allow webcam access, and choose the overhead webcam. Wait for **READY**. The webcam stays on for the next parcels; it does not need restarting after each scan.

Scan the individual order barcode, then the matching ID-card barcode. The existing order scan still marks the order Packed from any stage. The successful card check captures the previous 3 seconds and the next 20 seconds. The scanner pauses during this recording so the next parcel is not mixed into the clip. Camera switching and stopping are disabled until the clip finishes.

The recording is automatically uploaded and prepared as a 23-second MP4. **Saved** appears only after the completed video is verified in private storage. A missing or interrupted recording is not labelled saved. Existing card assignments are checked again, and repeat recordings can be attached to an already-paired order.

Open the order details and find **Packing videos** to view the clips. Access requires an active staff account. Videos are not added to the customer's public NFC certificate or tracking page.

If saving is interrupted, recovery copies stay in this browser's IndexedDB and retry every 15 seconds and when the connection returns. Keep the scanner page open until saving finishes; **Retry saving** can retry immediately. Returning to the scanner on the same browser resumes queued uploads. Changing pages within the app lets an in-progress recording finish and attempt saving. Closing the browser during the actual recording cannot preserve footage that has not yet been recorded.

The webcam records video only; it does not request microphone access. The order's saved voice message continues playing through the existing scanner audio player.
