# Packing videos

## Daily Production warehouse station

Open Daily Production → Barcode Scanner, click Start webcam, allow access, and choose the overhead webcam. Wait for READY. The camera stays on between parcels. Preview preserves the camera's aspect ratio.

1. Scan the individual order barcode. Its number stays visible immediately and recording starts before lookup finishes. Audio for up to 40 recent sewing-queue orders is preloaded; other orders load their saved audio on demand.
2. Scan its matching NFC-card barcode immediately. The station retains this scan while loading the order. Pairing does not mark Packed. A correct cue plays over customer audio; an error pauses audio, speaks the problem, and resumes it.
3. Pack the parcel and attach its shipping label. Show its J&T tracking barcode clearly to the webcam. Two consecutive fresh frames must match the complete tracking number. A wrong label keeps recording. A missing tracking number blocks this workflow until staff add it.
4. A match stops recording and saves the full clip as an MP4. The server rechecks the current tracking number, NFC ownership, and saved storage object. Only then does it mark Packed, including orders previously in Issue. The next parcel can start while the completed clip uploads.

Recording lasts until the label matches, with a three-minute safety limit. Reaching the limit, cancelling, losing the webcam, or incomplete footage does not mark Packed. Stay on the station while recording. Browser recovery cannot preserve footage that was never finalized.

Finalized clips remain in this browser's IndexedDB while uploading. They retry every 15 seconds, on reconnection, or with Retry saving. Returning in the same browser restores queued uploads. Keep the station open until saved; errors never count as a successful save.

Open order details → Packing videos to view saved clips. Staff access is required. Existing customer-tracker video access and verification rules are unchanged.

Video records without microphone audio. The customer's voice message plays separately for QC. Existing tablet packing uploads retain their prior timed format and verified-save completion gate.
