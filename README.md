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
