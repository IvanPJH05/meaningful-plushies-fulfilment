-- Customer submissions from the storefront Manual Order Collection block.
-- This table is intentionally private: the public proxy writes via the
-- server's service role and dashboard users access it through an admin-only API.
create table if not exists public.manual_order_intakes (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_email text not null default '',
  phone_original text not null,
  phone_normalized text not null,
  character text not null,
  product_key text not null,
  product_display_name text not null,
  shopify_variant_id text not null,
  shipping_region text not null check (shipping_region in ('WEST', 'EAST')),
  shipping_address jsonb not null default '{}'::jsonb,
  customisation_session_id uuid not null references public.customisation_sessions(id) on delete restrict,
  payment_receipts jsonb not null default '[]'::jsonb,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'ready_to_create', 'created', 'cancelled')),
  shopify_order_id text,
  shopify_order_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  created_by_order_at timestamptz
);

create index if not exists manual_order_intakes_status_idx
  on public.manual_order_intakes (status, created_at desc);
create index if not exists manual_order_intakes_phone_idx
  on public.manual_order_intakes (phone_normalized);
create unique index if not exists manual_order_intakes_session_idx
  on public.manual_order_intakes (customisation_session_id);

alter table public.manual_order_intakes enable row level security;

-- No anon/authenticated policies are intentionally created. Public collection
-- uses a server-side service role, and dashboard actions are authorised in the
-- app before that same protected client is used.
revoke all on public.manual_order_intakes from anon, authenticated;
