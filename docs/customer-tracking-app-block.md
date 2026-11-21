# Customer order tracking app block

The `Customer order tracking` block lives in the existing Meaningful Fulfilment theme extension. It renders the current public tracker directly in Shopify, without an iframe, cloned header or cloned footer. Styles and selectors stay inside `mp-order-tracking`; fonts inherit from the real theme. Its language follows the Shopify request locale selected by the theme header. The block has no separate language controls, and a `lang` query parameter cannot override the header selection.

`scripts/build-tracking-block.mjs` derives its markup, styles and lookup behaviour from `public/order-tracking`. Website/WhatsApp and TikTok lookup, five coarse milestones, English/Malay, help and not-found handling retain their existing behaviour. Each instance has separate IDs, channel selection and request cancellation. Shopify editor unload aborts its request.

The block posts to `/apps/closer/order-progress`, which verifies Shopify's existing signed app proxy and calls the unchanged `/api/customer-order-progress` handler. The public response still contains only a coarse stage, never customer identity, attachments, internal notes or credentials. The previous public tracking endpoint remains available for older links.

Release baseline: the active `meaningful-fulfilment-shirt-required-details` Shopify extension bundle from `tee-customizer-shopify-release`. Deploy from an assembled copy of that complete bundle plus these new tracking files, preserving its existing assets and creator discount function byte-for-byte. Do not deploy the older theme assets in this fulfilment branch over the active bundle.

Store page: `/pages/track-your-order`; theme `2027 update` (161251033159). Dedicated template `page.order-tracking.json` contains this app block, with the default Page section disabled only within this template. The theme header/footer groups remain untouched. Remove the old page body iframe and its header/footer-hiding CSS when assigning the new template. Preserve a backup before changing the body.

Checks: Shopify app-block schema validator, Shopify extension theme check, JavaScript syntax, TypeScript and Next.js production build. Local UI checks use isolated sample responses; verify the published Shopify proxy against the original public endpoint before completing the release.

Published on 21 November 2026: Shopify app release `customer-tracking-block-wide-20261121` (version 1260195315713); backend production `dpl_6yo2BPssr4kXB7GWeLRqaU1SNiEy` (02daf2a). All 82 existing extension baseline files were compared byte-for-byte and preserved. The page body is empty and its template suffix is `order-tracking`; the template's app section uses full width. The original iframe body is backed up locally under `tmp/tracking-verification/previous-page-body.html`.

Live browser checks passed: website order 2059, TikTok order 587054972893889798, Malay translation of the displayed result, the TikTok order-help dialog, and a missing-order response. A direct unsigned proxy call returns 403. Desktop has no horizontal overflow and no old iframe; the header is visible. The 390px phone viewport and desktop layout were visually checked, then the viewport override was reset. No orders were changed by these read-only lookups.
