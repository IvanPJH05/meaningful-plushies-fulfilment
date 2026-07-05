# Meaningful Plushies Fulfilment

Internal fulfilment dashboard with shared Supabase storage. Orders, imports, edits, status changes, deletions, packing-slip updates, and activity history are saved to the database so every user opening the same Vercel site sees the same data.

## Supabase setup

1. Create a Supabase project at `https://supabase.com/dashboard`.
2. Open **SQL Editor**, paste all of [`supabase/schema.sql`](supabase/schema.sql), and run it.
3. In **Project Settings > API**, copy the project URL and anon/public key.
4. Create `.env.local` for local development:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

5. Restart the local development server after changing environment variables.

The SQL creates `fulfilment_orders` and `activity_events`, enables row-level security, grants the dashboard access, and enables realtime updates. It can safely be run again when updating an existing project.

## Vercel environment variables

In the Vercel project, open **Settings > Environment Variables** and add:

| Name | Value | Environments |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | Production, Preview, Development |

Save the variables and redeploy the latest commit. Vercel only applies newly added variables to new deployments. The app displays a database connection message when either variable is missing or Supabase cannot be reached.

The production Supabase URL and publishable browser key are also included as deployment defaults, so the current Vercel site works before dashboard variables are added. Vercel variables take precedence and remain the recommended place to rotate these public credentials later.

Do not add a Supabase service-role key to this frontend application. It is not needed and must never be exposed through a `NEXT_PUBLIC_` variable.

## Canva envelope automation

The Print Envelope page uses the published Canva Brand Template `EAHMnYdOAJk`. For every two selected orders, Canva fills `top_plush_name` and `bottom_plush_name`, exports an A4 PDF, and the server combines the pages into one printable document.

Create a Canva Connect integration with `brandtemplate:content:read`, `design:content:write`, `design:content:read`, and `design:meta:read`, then add these server-only variables in **Vercel > Settings > Environment Variables**:

```env
CANVA_CLIENT_ID=YOUR_CANVA_CONNECT_CLIENT_ID
CANVA_CLIENT_SECRET=YOUR_CANVA_CONNECT_CLIENT_SECRET
CANVA_REDIRECT_URI=https://YOUR_DOMAIN.vercel.app/api/canva/callback
CANVA_ENVELOPE_TEMPLATE_ID=EAHMnYdOAJk
```

Apply them to Production, Preview, and Development, then redeploy. Do not prefix these values with `NEXT_PUBLIC_`. Open Print Envelope and select **Connect Canva** once; the server uses PKCE OAuth and automatically rotates Canva refresh tokens in an encrypted, HTTP-only cookie.

## Shopify direct order sync

The app can receive Shopify order-created and order-updated webhooks and save the order directly into Supabase, using the order metafield `upload_lift_form_data` for the plushie details. If the Shopify order has a tag like `J&T: 632101879476`, the courier and tracking number are updated in fulfilment.

Add these server-only variables in **Vercel > Settings > Environment Variables**:

```env
SHOPIFY_WEBHOOK_SECRET=YOUR_SHOPIFY_APP_CLIENT_SECRET
SHOPIFY_CLIENT_ID=YOUR_SHOPIFY_APP_CLIENT_ID
SHOPIFY_CLIENT_SECRET=YOUR_SHOPIFY_APP_CLIENT_SECRET
# Optional legacy/custom-app fallback. New Dev Dashboard apps can leave this blank.
SHOPIFY_ADMIN_ACCESS_TOKEN=
SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com
SHOPIFY_API_VERSION=2026-04
SHOPIFY_UPLOAD_LIFT_METAFIELD_KEY=upload_lift_form_data
SHOPIFY_UPLOAD_LIFT_METAFIELD_NAMESPACE=custom
SHOPIFY_TIKTOK_CERT_METAOBJECT_TYPE=$app:tik_tok_shop_cert_input
SHOPIFY_TIKTOK_CERT_UPLOAD_DATE_FIELD=upload_date
SHOPIFY_TIKTOK_CERT_INPUT_FIELD=input
```

Use this webhook URL in Shopify:

```text
https://YOUR_DOMAIN.vercel.app/api/shopify/webhooks/orders-create
```

Use this webhook URL for order updates, so tracking tags sync automatically after they are added:

```text
https://YOUR_DOMAIN.vercel.app/api/shopify/webhooks/orders-updated
```

For new Shopify Dev Dashboard apps, Shopify does not show a permanent Admin API token. Add the app **Client ID** and **Client Secret** from the Shopify Dev Dashboard app settings; the server exchanges them for a short-lived Admin API token automatically. If you have an older permanent Admin API access token, you can still provide `SHOPIFY_ADMIN_ACCESS_TOKEN` as a fallback.

In the Shopify app, enable order read access. The Admin GraphQL query used by this app validates against Shopify's current schema for `Order.metafields`; Shopify may also ask for related order scopes such as marketplace or quick-sale order access depending on the app configuration. After changing scopes or webhook settings, release the new Shopify app version and redeploy Vercel.

When an order is created or updated, Shopify calls the webhook, the server verifies the Shopify signature, fetches the full order and `upload_lift_form_data`, then creates or updates the matching fulfilment order. Existing status, notes, uploaded files, and fulfilment work are kept when the same order is received again. Tracking from Shopify tags replaces the fulfilment tracking number when a valid courier tag is present.

For the TikTok Shop JSON export button, the Shopify app must also have metaobject read/write access. The export creates a new `Tik Tok Shop Cert Input` metaobject entry each time, sets the upload date to today's Malaysia date, and writes the selected certificate JSON into the `input` field. If your Shopify field handles are different, change the three `SHOPIFY_TIKTOK_CERT_*` variables in Vercel to match the metaobject type and field keys.

## Meta Conversions API

The app can send server-side Meta Conversions API `Purchase` events after Shopify orders are saved. By default, use **Settings workspace > Meta CAPI** and keep the mode on **Only RM0/manual-payment Shopify orders**. This avoids double counting normal Shopify Pixel purchases while still reporting the corrected revenue for orders where Shopify says RM0 but fulfilment collected payment manually.

Add these server-only variables in **Vercel > Settings > Environment Variables**:

```env
META_PIXEL_ID=YOUR_META_PIXEL_ID
META_CAPI_ACCESS_TOKEN=YOUR_META_CONVERSIONS_API_ACCESS_TOKEN
META_TEST_EVENT_CODE=
```

Apply them to Production, Preview, and Development, then redeploy. Do not prefix these values with `NEXT_PUBLIC_`.

Run the latest [`supabase/schema.sql`](supabase/schema.sql) in Supabase SQL Editor. The SQL adds the Meta status fields to fulfilment orders plus `meta_capi_settings` and `meta_capi_logs`.

In the dashboard, open **Settings workspace > Meta CAPI** to enable or disable sending, add a test event code, send test purchases, retry saved Shopify order numbers, and review the last 100 Meta responses.

## Ads workspace

The **Ads** workspace reads Meta Ads Insights and shows spend, revenue, ROAS, CPA, purchases, and tracking health. Tracking health comes from the Meta CAPI logs saved by the fulfilment app, so you can see whether server-side purchase events are working.

Add these server-only variables in **Vercel > Settings > Environment Variables**:

```env
META_AD_ACCOUNT_ID=act_YOUR_META_AD_ACCOUNT_ID
META_MARKETING_ACCESS_TOKEN=YOUR_META_MARKETING_API_ACCESS_TOKEN
META_GRAPH_API_VERSION=v20.0
```

`META_MARKETING_ACCESS_TOKEN` needs permission to read Meta ads insights for the ad account. If the variables are missing, the Ads workspace still opens and shows exactly what setup is missing.

## TikTok Shop order sync

TikTok Shop sync only imports the order shell: order ID, buyer/recipient details if TikTok exposes them, product/SKU, price, shipping, tracking, and status. TikTok does not provide the plushie personalization data like Shopify Upload Lift metafields, so plushie name, meaningful note/message, and the customer file still need to be added manually in the fulfilment order drawer or TikTok Shop page.

Add these server-only variables in **Vercel > Settings > Environment Variables**:

```env
TIKTOK_SHOP_APP_KEY=YOUR_TIKTOK_SHOP_APP_KEY
TIKTOK_SHOP_APP_SECRET=YOUR_TIKTOK_SHOP_APP_SECRET
TIKTOK_SHOP_ACCESS_TOKEN=YOUR_TIKTOK_SHOP_ACCESS_TOKEN
TIKTOK_SHOP_ID=YOUR_TIKTOK_SHOP_ID
TIKTOK_SHOP_BASE_URL=https://open-api.tiktokglobalshop.com
TIKTOK_SHOP_ORDER_DETAIL_PATH=/api/orders/detail/query
TIKTOK_WEBHOOK_SECRET=
```

Use this webhook URL in TikTok Shop Open Platform:

```text
https://YOUR_DOMAIN.vercel.app/api/tiktok/webhooks/orders
```

When TikTok sends an order webhook, the app extracts the TikTok order ID, fetches the order from TikTok Shop, saves it as a TikTok fulfilment order, and leaves the plushie data blank for manual entry. Existing TikTok orders can also be selected on the Orders page and refreshed with **Sync TikTok**.

## Existing browser data

Old data saved in a browser's `localStorage` is intentionally no longer loaded. After configuring Supabase, import the Shopify CSV once from the dashboard. From then on, all devices use the shared database copy.

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. The current login screen controls dashboard roles only; use `admin@meaningfulplushies.com` or `staff@meaningfulplushies.com` with any password.

## Security note

The included policies allow users with the public Vercel link to read and change dashboard data, which matches the current shared-link workflow. Before exposing the site publicly, replace the demo login with Supabase Auth and restrict the row-level security policies to authenticated staff.
