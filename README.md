# Meaningful Plushies Fulfilment

Simple internal courier-style dashboard for replacing the current Google Sheets fulfilment tracker.

## Included

- Staff login demo with Admin and Staff roles
- Searchable and filterable orders dashboard
- Full order detail drawer
- Eight fulfilment statuses and permanent status history
- Courier and tracking management
- Customer WhatsApp links
- Tailor/packing photo field
- Shopify CSV import with optional metafield matching
- Fulfilled-order CSV export
- Browser-local demo persistence
- Supabase Auth, database, Storage, and role-policy schema

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

The current UI uses browser storage so the workflow can be reviewed without credentials. Demo customer information is fictionalized. Use `admin@meaningfulplushies.com` or `staff@meaningfulplushies.com` with any password to preview each role. To reset the demo, clear the `mp-dashboard-orders` and `mp-dashboard-session` local-storage keys.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local` and fill in the project URL and keys.
4. Replace browser-local persistence in `app/page.tsx` with Supabase queries/server actions.

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.

## Current boundary

This is the reviewable MVP implementation. The Supabase schema is ready, but connecting live authentication, database persistence, Storage, and Vercel deployment requires the corresponding project credentials.
