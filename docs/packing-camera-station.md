# Packing videos

## Daily Production warehouse station

Open Daily Production → Barcode Scanner, click Start webcam + microphone, allow both permissions, and choose the overhead webcam and microphone. Wait for READY. The camera stays on between parcels. Preview preserves the camera's aspect ratio.

1. Scan the individual order barcode. Its number stays visible immediately and recording starts before lookup finishes. Audio for every order sent for sewing is preloaded, following all pages of the order list. Wait for the ready counter to finish for immediate playback. Use Refresh order audio to include newly added sewing orders or retry unavailable recordings; other orders still load their audio on demand.
2. Scan its matching NFC-card barcode immediately. The station retains this scan while loading the order. Pairing does not mark Packed. A correct cue plays over customer audio; an error pauses audio, speaks the problem, and resumes it.
3. Pack the parcel and attach its shipping label. Show its J&T tracking barcode clearly to the webcam. Two consecutive fresh frames must match the complete tracking number. A wrong label keeps recording. A missing tracking number blocks this workflow until staff add it.
4. A match stops recording and saves the full clip as an MP4. The server rechecks the current tracking number, NFC ownership, and saved storage object. Only then does it mark Packed, including orders previously in Issue. The next parcel can start while the completed clip uploads.

Recording lasts until the label matches, with a three-minute safety limit. Reaching the limit, cancelling, losing the webcam, or incomplete footage does not mark Packed. Stay on the station while recording. Browser recovery cannot preserve footage that was never finalized.

Finalized clips remain in this browser's IndexedDB while uploading. They retry every 15 seconds, on reconnection, or with Retry saving. Returning in the same browser restores queued uploads. Keep the station open until saved; errors never count as a successful save.

Open order details → Packing videos to view saved clips. Staff access is required. Existing customer-tracker video access and verification rules are unchanged.

Video records sound from the selected microphone, including packing sounds and customer audio played aloud through the station speakers. The preview stays muted to prevent feedback. Headphone playback is not captured by the microphone. Camera or microphone disconnection cancels the current parcel without marking it Packed. Saved MP4s preserve audio when present; older silent clips remain compatible. Existing tablet packing uploads retain their prior capture settings, timed format and verified-save completion gate.
