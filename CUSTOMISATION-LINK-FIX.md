# Customisation lost between form submission and Shopify checkout

Orders #1885 and #1887 were inspected read-only in Shopify and Supabase. Their current Supabase links were manually repaired. Shopify itself has no line-item customisation properties and no cart customisation attribute for either order. Forms completed several minutes before checkout; session linking timestamps were roughly nine hours later. This establishes an upstream checkout capture failure, rather than a missing form submission.

The normal order #1886 shown by the merchant carries `customisation_session_id` alongside the form fields on its Shopify line item. The live product page includes a `shopify-accelerated-checkout` host. The deployed classic plushie script only recognises button/input event targets, so an event retargeted from a wallet's shadow root to that host bypasses capture. We cannot determine which purchase control the two customers used from the order records alone.

## Changes

- Both storefront blocks use a shared locale-aware Ajax cart helper. It sends explicit line properties, verifies every form property and the session ID in Shopify's response, and redirects only after verification. Wallet controls route through ordinary Shopify checkout after the verified addition. Add to cart opens the cart page.
- Retried requests reuse an existing cart line with the same variant, session, details and quantity. Changed details or quantities require removing the existing item rather than silently duplicating it.
- Backend imports retain Shopify line IDs and line session references. Binding and certificate preparation use each line's reference instead of flattened array positions. A single cart fallback is used only for a single fulfilment row.
- Binding errors, missing sessions and conflicting/concurrent assignments fail visibly so callers can retry. Replays preserve progressed fulfilment statuses and avoid repeatedly appending the same linkage history.
- No production records were changed. Existing timestamp-based recovery remains a legacy fallback; it cannot prove customer identity and should eventually be replaced by an explicit reconciliation queue.

## Validation and release

Local tests, TypeScript, production build, JavaScript syntax and lint checks pass (existing lint warnings remain). Shopify GraphQL validation passes for the new line ID selection. Shopify theme checks pass for all five changed extension assets/blocks. A local browser fixture with mocked Shopify responses confirms shadow-host wallet capture, duplicate-free retries, and checkout stopping on missing properties. No real purchase was made.

This branch is stacked on the pending lazy workspace loading branch. Deploy the reviewed backend through Vercel and publish the `meaningful-plushie-customisation` extension with the authenticated Shopify CLI using the checked-in app configuration. Vercel deployment alone does not publish extension assets. Confirm the storefront loads `customisation-cart.js`, then verify a controlled test order has the session ID and form fields on its line item and the matching session is linked to that exact fulfilment row. Check both Add to cart and Buy it now, plus a multi-line cart. Verify order refresh preserves a progressed fulfilment status. Do not use already repaired #1885/#1887 as proof of automatic linking.
