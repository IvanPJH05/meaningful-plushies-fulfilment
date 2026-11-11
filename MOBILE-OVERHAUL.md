# Mobile fulfilment overhaul

Baseline: main at a69a1a5. This is a repository audit. Live policies, integrations and hardware still need staging verification.

- Desktop runs through the Next.js App Router, with the main dashboard in app/page.tsx and separate production, fulfilment and integration routes. Mobile is a separate Vite/React entry bundled with Capacitor for Android.
- Mobile authenticates through dashboard_login and checks dashboard_sessions plus active admin/staff roles in lib/mobile-api.ts. Manual approvals and reports have their own role checks. Mobile has no Supabase browser credentials. The schema enables RLS and declares Realtime publications, but publication membership alone does not authorize mobile subscriptions.
- fulfilment_orders stores indexed order number, status and update time alongside the order JSON. Customisation sessions, push device registration and other features have separate migrations. Mobile status transitions compare status and update time before writing history.
- Existing APIs cover exact order-number/barcode lookup, details, voice/certificate fields, authenticated assets, stage transitions, manual orders, reports and push registration. Shopify and TikTok order ingestion and shipping, certificate processing, production batches and desktop NFC use separate handlers. Recording a mobile stage change is distinct from purchasing a label or notifying a marketplace.
- The current mobile home combines filters, counts, scan and search. Lookup fails for a match outside the local order list. A complete archive can prevent explicit refresh from fetching a new page. Cached detail can lag after another device updates an order.

## Rollout

1. Ship the mobile shell, five tabs, exact lookup fix, focused production queue and refreshed detail workflow against existing APIs. Keep desktop and schema outside this change.
2. Validate the workflow on two Android devices with admin and staff accounts, old offline archives and real packing labels. Reconcile the NFC implementation on codex/packing-label-import with main, then test write/read-back, mismatched tags and interrupted writes before marking pairing verified.
3. Validate shipping permissions and marketplace side effects in staging before exposing carrier mutations. If checklist persistence is needed, specify its authority and audit history, add compatible schema changes, test old clients and backfill separately.
4. Design authenticated live invalidation for the dashboard-session model. Stage a browser installable shell with explicit cache rules, no service-worker caching of order data, authenticated assets or tokens, and test shared-device sign-out before rollout. Keep Android distribution independent.
