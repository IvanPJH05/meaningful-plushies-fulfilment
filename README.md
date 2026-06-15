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

Create a Canva Connect access token with `design:content:write`, `design:meta:read`, and `design:content:read`, then add these server-only variables in **Vercel > Settings > Environment Variables**:

```env
CANVA_ACCESS_TOKEN=YOUR_CANVA_CONNECT_ACCESS_TOKEN
CANVA_ENVELOPE_TEMPLATE_ID=EAHMnYdOAJk
```

Apply them to Production, Preview, and Development, then redeploy. Do not prefix the token with `NEXT_PUBLIC_`; it must remain server-only. Canva access tokens expire, so replace `CANVA_ACCESS_TOKEN` and redeploy when the dashboard reports that it has expired.

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
