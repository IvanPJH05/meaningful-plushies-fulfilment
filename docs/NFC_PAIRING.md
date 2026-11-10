# Prewritten NFC cards and final packing

Open **Fulfilment → NFC Card**. Existing card-unlocking tools are below the new station.

## Prepare stock

1. In **Prepare cards**, an administrator generates 1–1,000 permanent links per batch.
2. Download the links CSV and matching barcode-label PDF. Print at 100% actual size, using 50 × 25 mm thermal labels or the A4 layout.
3. Stick each barcode on its box first. Install and start the latest Windows NFC Helper, then open **Write from packaging barcode**.
4. Place one blank card on the reader and scan the box barcode with an Enter-terminated scanner. The helper writes the matching permanent link and reads the tag back before the app marks it programmed. Wait for confirmation, then immediately put the verified card inside that box before scanning another.
5. If a supplier prewrites the cards, read the physical card and use **Verify prewritten card** to check its URL. Programming is separate from pairing.

Each customer-facing link uses an opaque random token on the fulfilment app's `/n/` route. The printed sequential number is for staff and does not expose the public token. Keep the production app domain active for the life of these cards.

## Production and packing

At Batch Fulfilment's NFC step, **Use prewritten cards — pair at packing** sends the batch to sewing without writing individual customer URLs. This explicitly opts those orders into a required final pairing checkpoint. Existing directly written batches keep their current workflow.

In **NFC Card → Pair at packing**, scan the individual plushie's packing-slip barcode and the box's NFC sticker, in either order. The scanner must send Enter after a scan. The second scan commits the pairing, confirms it on screen and restores focus for the next box. Move the confirmed box to the completed area immediately.

New packing slips use `MPI-<fulfilment item ID>` so split orders can be distinguished. Legacy order barcodes and existing certificate URLs work only when they resolve to exactly one item. Reprint ambiguous packing slips. The audio scanner accepts both old and new packing-slip codes and also rejects ambiguous matches.

Pairing validates the current order, approved certificate/Our Link destination, certificate sync progress, programmed-card state and duplicate assignments in one database transaction. Orders with shared certificate destinations must have their individual certificate links corrected before pairing. Pairing does not itself mark an order Packed or Shipped; orders using the prewritten batch mode cannot enter either stage until paired.

## Corrections

An administrator can **Undo pairing** or **Void card**, with a reason. Undo makes the card available again and its URL stops opening the previous plushie's page. Void makes the card unusable. Neither erases audit history. Search inventory by card barcode/number to correct older pairings; the pairing station also offers undo for its last successful scan.

## Implementation and verification

- Authenticated API: `/api/fulfilment/nfc`; generation/programming/corrections require admin, pairing allows warehouse staff.
- Public read-only redirect: `/n/[opaque-token]`; temporary redirects and activation pages are never cached.
- New tables use RLS, have no browser grants, and are accessed only through server-side warehouse handlers. Existing certificate records are reused.
- `node scripts/test-nfc-pairing.mjs` checks database generation/retry, ambiguous scans, duplicates, corrections, readiness, permissions and packing gates using a local PostgreSQL engine.
- `node --experimental-strip-types --test lib/nfc-cards.test.ts lib/order-barcode.test.ts` checks card input, approved destinations and unique item codes.
- Local interface verification covered both scan orders, automatic pairing/reset/focus and thermal/A4 PDF downloads. Physical reader and scanner operation still needs a real card at commissioning.
