# Direct TikTok Shop integration

Implementation status: backend and connection page prepared; live seller authorization and live API verification are required before calling this connected.

## First release

- Admin-only connection page at `/tiktok-connect`; uses the existing dashboard session.
- One Malaysia shop. Explicit shop selection via `TIKTOK_SHOP_ID` if the seller owns more than one shop.
- Single-use, expiring OAuth state bound to the initiating admin session and secure HTTP-only browser cookie.
- Seller access/refresh tokens encrypted with AES-256-GCM and stored in service-role-only tables. Browser never receives tokens.
- Current versioned order-detail endpoint, header-based access token and secret-wrapped request signing.
- Original TikTok IDs remain strings; platform/shop/tracking identifiers cannot be mistaken for order IDs.
- Signed webhook ingress persists minimal event IDs before acknowledgement. Duplicate deliveries do not reset completed work. Failed jobs remain pending with bounded backoff.
- Automatic five-minute recovery sweeps plus admin manual recovery. Initial recovery looks back 24 hours, then uses an overlapping update-time cursor with persisted pagination.
- Staff personalization and attachments are preserved. Unpaid/on-hold/cancelled historical orders are not created as new production work. Existing cancellations are flagged for review.
- Multi-item orders are flagged for staff review; automatic per-item production splitting is not part of this release.

## Required server configuration

`TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET`, `TIKTOK_SHOP_AUTHORIZATION_URL` (copy the seller link from Partner Center), `TIKTOK_SHOP_REDIRECT_URI`, `TIKTOK_TOKEN_ENCRYPTION_KEY` (64 random hex characters), `CRON_SECRET`, and existing Supabase service credentials. Never prefix secrets with `NEXT_PUBLIC_`.

Migration: `supabase/migrations/20261031000100_tiktok_connection.sql`.

Partner Center redirect: `https://meaningful-plushies-fulfilment.vercel.app/api/tiktok/callback`.

Webhook URL: `https://meaningful-plushies-fulfilment.vercel.app/api/tiktok/webhooks/orders`.

Subscribe to Order Status Change, Recipient Address Update, Cancellation Status Change, Order Return Status Change, and Seller Deauthorisation where available under the granted scopes. Review actual app webhook delivery samples and signature verification with Partner Center before enabling production processing.

## Verification before go-live

1. Apply migration, check anonymous/authenticated roles cannot read any token/state/event table.
2. Set server credentials, callback URL and published-app seller authorization URL.
3. Deploy. Sign in as administrator, open connection page, authorize intended shop. Review granted permissions before authorizing.
4. Confirm shop name, token expiry and authorized shop identifiers; test a real single-item order without changing its fulfilment state.
5. Send Partner Center webhook test; confirm valid signature accepted, altered signature rejected, event retained and completed once.
6. Compare a recent order with Seller Center: recipient, address, amount, currency, SKU, courier/tracking. Confirm manual personalization survives repeated sync.
7. Confirm recovery cron has `CRON_SECRET`, cursor advances only after successful full pagination, and pending failed events retry.

## Other capabilities to evaluate separately

| Capability | Application in fulfilment | Additional access/work |
| --- | --- | --- |
| Order changes / recipient changes | Keep imported order and address current | Order Information and available webhook topics |
| Cancellations / returns | Flag affected production work for staff review | Notifications; detailed aftersales APIs may need separate permissions |
| Shipping labels / package details | Fetch TikTok labels for batch printing | Fulfillment Basic / Logistics as required by each endpoint; not enabled by this release |
| Shipment actions | Arrange shipping / ready-to-ship updates | Additional write permissions and an explicit staff action design |
| Finance / settlements | Reconcile sales, fees and payouts | Finance Information; separate accounting mapping |
| Customer messages | Help collect missing customization details | Customer Service approval; no auto-messaging in this release |
| Products / inventory | Potential stock integration | Separate product/inventory permissions and ownership rules |

Sources: [Order API overview](https://partner.tiktokshop.com/docv2/page/order-api-overview), [Get Order List](https://partner.tiktokshop.com/docv2/page/get-order-list-202309), [Get Order Detail](https://partner.tiktokshop.com/docv2/page/get-order-detail-202507), [Common parameters](https://partner.tiktokshop.com/docv2/page/common-parameters), [Webhook configuration](https://partner.tiktokshop.com/docv2/page/configuration-guide). Account-specific scopes and event availability are determined in Partner Center.
