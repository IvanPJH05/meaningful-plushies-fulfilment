# Daily Production manual payment check

Step 2 now accepts one daily manual payment count. Unpaid submissions in Awaiting approval no longer require individual deferral reasons or block the next task. Receipt approval and Shopify order creation remain explicit existing actions.

The admin-only manual intake endpoint accepts `paymentDay=YYYY-MM-DD` and returns a compact summary of verified manual payments and distinct created Shopify orders. It pages through all matching records and never returns receipt URLs. The day uses Malaysia midnight boundaries and `paid_at` (the existing receipt attachment timestamp), rather than submission date. Cash on delivery, unpaid, cancelled and receiptless records are excluded. Payments without a created Shopify order are listed separately. Counts assume one payment per intake/order, not split instalments or several orders covered by a single transfer.

The entered count is retained in this browser for the day; receipt/order records are not altered. Continuing rechecks fresh server data, requires the entered count, payment count and order count to match, and refreshes fulfilment orders. Zero is valid. The receipt management panel remains available under a collapsed section.

Validation: three focused tests cover Malaysia day boundaries, exclusions, missing orders, duplicate Shopify IDs, zero and invalid dates. Type checking and the production build passed. No schema migration or permission change is required.

Deployment source: `9220efd`, branch `codex/daily-manual-payment-tally`. Production publication is waiting for Vercel email reauthentication; the preview build is `Fsc3yDFB5NRoVSszGRagA3jZinXj`. After publication verify zero/different counts, a matching real count and unchanged unpaid submissions in the signed-in Daily Production workspace.
