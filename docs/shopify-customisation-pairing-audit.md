# Shopify customisation pairing audit — 30 October 2026

## Release decision

**Not published.** Pairing-specific checks pass, the clean production build passes, and no production records or settings were changed. Shopify still denies management access to the existing Meaningful Fulfilment app that serves the active product forms. This is not a failed Intake login: the current Intake release is a different app identity.

This audit provides evidence for the tested paths, not a guarantee that every possible browser, external service, hardware action or customer checkout cannot fail. A real completed-order acceptance check is still needed after the correct extension is released.

## Verified live structure

- Main theme: AUG Website Updates, 144436920391. Draft: Meaningful id update, 160380125255.
- Product template `product.whatsapp-order.json` uses `meaningful-fulfilment/blocks/deferred-customisation`.
- Product template `product.plush-charm.json` uses `meaningful-fulfilment/blocks/snowy-charm-voice`.
- Page template `page.customise-your-plushie.json` uses the existing post-purchase `customisation-link-form`.
- Active product scripts come from CDN extension release `meaningful-fulfilment-101`. Its deferred script lacks the later save serialization and cart verification. `customisation-cart.js` returns 404 in that old release.
- Root app client ID: `26bd67c2b2d4cdf511a95649aa9a682a`. Original extension UID: `162c3894-fb90-cef3-f7e1-e03e561b6229cce88138`.
- Owned Intake app client ID: `6043167ddb69732554a716e060a35712`. Its UGC release and proxy configuration are unchanged.
- Publishing an additional Intake block would not replace the existing active product blocks. The preliminary unused Intake pairing extension was moved outside the deploy project into the audit artifacts; it must not be mistaken for an activated fix.

## Cause and intended behavior

Sessions are saved before a Shopify order exists. The product line must carry `customisation_session_id` into checkout. The cart also carries `mp_customisation_session_id` as a backup. The importer retains the reference on each purchased line; the webhook, manual refresh and catch-up use the same binding logic.

When an exact line reference exists, two saved submissions are not ambiguous: the purchased line identifies the chosen session. When that reference is lost, the existing time-window recovery deliberately refuses to choose between multiple candidates. Picking the newest unbound session globally could attach another customer's details.

Read-only production checks found one submitted, voice-bearing session linked to order 1937. Fifteen sessions with the same plush name were created within an hour of that linked session; fourteen are unbound. Only one has exactly identical complete form data (excluding the bound-page URL). This is consistent with multiple edits/submissions, but a shared name alone does not establish customer identity. There are zero duplicate non-null fulfilment-order bindings across the session table. Unbound sessions also include unfinished or abandoned shopping; they are not automatically missing orders and were not bulk attached.

The existing prepared fix adds an explicit cart item, verifies its saved customisation fields and backup reference before navigation, prevents duplicate retry additions, and preserves each line's exact session. The additional audit fix waits for an in-flight old audio upload before uploading a replacement and rechecks the selected audio after an earlier form save completes. It prevents the cached old fingerprint from returning the wrong upload.

## Component and behavior comparison

| Component | Evidence / result | Runtime change in reviewed patch |
| --- | --- | --- |
| Classic product identity fields, note, voice recorder, player, draft restoration | Live vs local script diff reviewed; all three associated CSS files identical to live | Save/upload coordination and verified cart submission only |
| Charm voice upload and recording | Live vs local script diff reviewed; Charm CSS identical; binding test preserves audio-only behavior | Verified cart submission through shared helper |
| Add to cart and Buy now | Existing tests check properties, lost responses, retry reuse, wallet/shadow-host recognition and localized cart endpoints | Verify persisted cart before existing cart/checkout navigation |
| Repeated submissions and edited audio | Three timing tests execute the actual browser function bodies. Old unchanged code fails two; patched code passes all three | Four extra executable lines plus the upload wait block |
| Per-line order mapping | Nine integration tests execute the real binder with mocked services, including reversed session order and stale cart mirror | Backend unchanged |
| Duplicate, missing or competing bindings | Tests reject cross-order reuse, one session on two lines, and failed concurrent binding | Backend unchanged |
| Orders/create and orders/updated | Shared handler, signature checks, failed critical-save retry tested | Unchanged |
| Refresh and catch-up | Staff authorization and server-client persistence covered; reviewed both call the shared binder | Unchanged |
| Certificates and Our Link | Tests preserve per-line certificate association, submitted voice and Charm Our Link; post-purchase form script identical to live | Unchanged |
| Production stages | Binding replay retains advanced stage/history in new test | Unchanged |
| Manual order collection and order video | Their JavaScript matches live byte-for-byte after line-ending normalization | Unchanged |
| Certificate styles | CSS matches live | Unchanged |
| Batch labels, envelopes, audio ZIP/cache/conversion, COD, imports, stock, sales, order edits and workspace loading | Existing unit and route suites run; see results below | Unchanged |
| NFC, creator discounts, creator Sheet sync, Marketing approval/upload routes | Existing route suites run where available; no helper binaries, Functions, scope/proxy settings or service credentials included in patch | Unchanged; physical reader and external end-to-end actions not rehearsed |

## Verification results

- Clean source: archived committed HEAD `b0396d1`, overlaid only the new deferred-script race fix and its two new test files. Existing uncommitted production/certificate/accounting work was excluded.
- Clean production build: **passed**, 82 app entries compiled/generated; existing unused-variable and CSS compatibility warnings remain.
- TypeScript check in working tree: **passed**.
- Clean unit suite: **133 passed, 0 failed**. The working-tree unit suite also passed 160 tests, but includes unrelated uncommitted tests and is not the release baseline.
- Default Node runner cannot resolve one pre-existing extensionless TypeScript import. A temporary resolver under audit artifacts was used without changing application/package files.
- Clean integration suite: **95 passed, 1 failed** across 16 files. Includes the 12 new timing/binding cases. The failure is the unchanged marketing UGC test expecting three discount-function arguments; current unchanged implementation supplies the explicit fourth `ugc_all` collection argument. No marketing runtime code was changed to hide it.
- Legacy `scripts/test-order-edits.mjs`: cannot execute its checks because it tries to extract SQL that the endpoint no longer contains; the endpoint now calls `edit_fulfilment_order`. This test script and endpoint were not changed by this fix. Existing order-edit unit coverage still runs in the unit suite.
- Both product Liquid blocks pass the Shopify Liquid validator; all three patched JavaScript assets pass `node --check`.
- Eight unaffected assets compared with production CDN: deferred CSS, recorder CSS, polish CSS, Charm CSS, post-purchase form JS, order video JS, manual collection JS and certificate CSS are identical after newline normalization.
- No real purchases, uploads, discounts, emails, card writes, customer sessions or order bindings were created/modified for verification.

## Patch and deployment gate

Reviewed ZIP: `../artifacts/pairing-audit/shopify-pairing-fix-reviewed.zip`; manifest: `../artifacts/pairing-audit/patch-manifest.txt`.

Exactly five storefront files are included: shared `customisation-cart.js`, the deferred and Charm scripts, and the two corresponding Liquid blocks that load the helper. No backend, theme template, app configuration, proxy, scope, Function, credential, database schema or unrelated UI is included.

A fresh read-only `shopify app info --json --no-input` against the original app failed with HTTP 403, "You are not a member of the requested organization", request `d052006f-b640-44c7-bf5e-58f6b7536c1a-1793292059`. No deployment was attempted past that access gate.

Before production acceptance:
1. Restore management access to that exact app, or plan a separately reviewed migration of both active product blocks to Intake. Changing only the root client ID would risk existing app resources and is not a fix.
2. Overlay only the five reviewed storefront files on the authorised original app checkout. Preserve all existing extension identifiers and other assets. Require a release plan with no configuration changes, no removals and no unrelated new blocks/Functions.
3. Verify both active product pages actually load the new helper before their main script.
4. Rehearse changed form fields, replacement audio, double click, retry after failed cart response, multiple customized items and checkout; complete a controlled order and confirm its purchased line ID, session ID, audio and certificate/Our Link agree.
5. Keep genuinely ambiguous historical orders for manual review; do not attach all unbound sessions by recency.
