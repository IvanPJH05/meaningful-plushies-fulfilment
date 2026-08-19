-- One secure record for every customer who chooses to complete their plushie
-- personalisation after checkout. It is deliberately not exposed to anon users.
create table if not exists public.customisation_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  order_id text,
  order_number text,
  line_item_id text,
  cart_line_key text,
  mode text not null check (mode in ('complete_now', 'fill_later')),
  delivery_method text check (delivery_method in ('email', 'whatsapp')),
  contact_email text,
  contact_phone text,
  status text not null default 'draft' check (status in ('draft', 'pending_payment', 'awaiting_customisation', 'submitted', 'expired', 'cancelled')),
  form_data jsonb not null default '{}'::jsonb,
  voice_storage_path text,
  link_sent_at timestamptz,
  link_opened_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customisation_sessions_order_line_unique unique (order_id, line_item_id)
);

alter table public.customisation_sessions enable row level security;
