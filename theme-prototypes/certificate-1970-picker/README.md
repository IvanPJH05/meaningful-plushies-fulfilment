# Shipped card 19701698520: certificate choice

Scope is the existing shared `/pages/certificate/19701698520` link and its two child certificates only. Every other certificate renders no picker markup or script. Do not publish the unrelated draft theme wholesale: `Meaningful id update` contains earlier fluid-layout work.

The shipped NFC URL remains unchanged. First visit opens a modal with BEST YE YE (Billy) and SUPER PAPA (Dragon Warrior). Selection is saved in this browser under `mp:certificate-choice:19701698520:v1`. Later scans replace the landing URL with the selected child's URL. Child pages have a Change plushie link using `?choose=1`, which bypasses the remembered choice. Only the two exact child codes are accepted; arbitrary stored URLs cannot redirect the visitor. Storage failures fall back to asking again. Without JavaScript, the choice links remain usable.

Separate active Shopify certificates were created:

- `19701698520-1` → BEST YE YE, fulfilment item `1970-1`.
- `19701698520-2` → SUPER PAPA, fulfilment item `1970-2`.

Each child uses its own saved birth details, meaningful note and character artwork. Voice files remain in the existing private order/session storage. The root's linked_certificates references both children; each child's certificate_family references the root. This metadata does not enable the picker for any other code.

The two fulfilment orders and their submitted customisation sessions now reference the separate children. The accompanying narrowly scoped database migration prevents old Shopify imports from restoring the shared code. It preserves a repaired session's certificate/metaobject binding. Other orders and fulfilment stages are unchanged.

## Installation

Add `sections/certificate-1970-picker.liquid` and `assets/certificate-1970-picker.js` to the current live theme. Add the `certificate_1970_picker` section to the beginning of the existing `templates/metaobject/version_1_certs.json` order, preserving every other section and setting. The template in this folder is the exact live template read on 3 November 2026 plus that one section. Re-read the live template and compare before writing it, in case the merchant has edited it meanwhile.

The three-file change has been installed and previewed on draft theme `160380125255`. **Live theme installation is pending:** the owner browser's Online Store/Code Editor iframe remained blank. The Shopify connector supports theme file writes on unpublished themes only. Do not claim the shared customer link is live until verified without preview cookies/parameters.

## Validation

- Shopify Liquid validator: valid.
- `node scripts/test-certificate-1970-picker.mjs`: selection, remembering, change selection, invalid stored value, storage denied, unrelated code.
- `node scripts/test-certificate-1970-links.mjs`: stale-import protection, repaired session binding, unrelated order and stage preservation.
- Browser draft preview: both certificates display their own correct details; revisiting the root automatically opens the remembered SUPER PAPA selection; Change plushie opens the selector again. The dialog fits a 390px phone viewport without horizontal overflow. An unrelated certificate renders no picker markup.

Before final release verify the published root link in a browser without a theme preview session. Both repaired orders have matching session codes, no duplicate-link warning, and fully synced certificate jobs.
