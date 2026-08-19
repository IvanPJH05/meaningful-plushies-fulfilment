create table if not exists public.monthly_journal_shopee_shortcuts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  debit_account_id uuid not null references public.monthly_journal_accounts(id),
  journal_note_template text not null default '',
  description_template text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.monthly_journal_shopee_shortcuts enable row level security;

create policy "shared monthly journal shopee shortcuts"
  on public.monthly_journal_shopee_shortcuts
  for all to anon, authenticated
  using (true) with check (true);
