-- Statement originals use the existing Monthly Journal storage/access model.
create table if not exists public.monthly_journal_statements (
  id uuid primary key default gen_random_uuid(),
  bank text not null,
  filename text not null,
  storage_path text not null unique,
  first_transaction_date date not null,
  last_transaction_date date not null,
  transaction_count integer not null check (transaction_count > 0),
  uploaded_at timestamptz not null default now()
);
alter table public.monthly_journal_statements enable row level security;
grant select, insert on public.monthly_journal_statements to anon, authenticated;
create policy "shared monthly journal statement reads" on public.monthly_journal_statements
  for select to anon, authenticated using (true);
create policy "shared monthly journal statement inserts" on public.monthly_journal_statements
  for insert to anon, authenticated with check (true);
create index monthly_journal_statements_latest on public.monthly_journal_statements (bank, uploaded_at desc);
