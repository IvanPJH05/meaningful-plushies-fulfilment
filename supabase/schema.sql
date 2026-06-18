create extension if not exists pgcrypto;

create table if not exists public.fulfilment_orders (
  id text primary key,
  order_number text not null,
  status text not null default 'new_order',
  order_date timestamptz,
  updated_at timestamptz not null default now(),
  data jsonb not null
);

create index if not exists fulfilment_orders_number_idx
  on public.fulfilment_orders ((order_number::bigint), id);
create index if not exists fulfilment_orders_status_idx
  on public.fulfilment_orders (status);
create index if not exists fulfilment_orders_updated_idx
  on public.fulfilment_orders (updated_at desc);

create table if not exists public.activity_events (
  id text primary key,
  order_number text,
  action text not null,
  detail text not null default '',
  actor text not null default 'System',
  created_at timestamptz not null default now()
);

create index if not exists activity_events_created_idx
  on public.activity_events (created_at desc);

create table if not exists public.payment_processor_settings (
  processor text primary key,
  percentage numeric(8,4) not null default 0 check (percentage >= 0),
  fixed_amount numeric(12,2) not null default 0 check (fixed_amount >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_fee_settings (
  id text primary key default 'default' check (id = 'default'),
  shopify_percentage numeric(8,4) not null default 0 check (shopify_percentage >= 0),
  updated_at timestamptz not null default now()
);

insert into public.sales_fee_settings(id)
values ('default')
on conflict (id) do nothing;

create table if not exists public.dashboard_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9._-]{3,40}$'),
  display_name text not null,
  role text not null check (role in ('admin', 'staff')),
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dashboard_sessions (
  token uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.dashboard_accounts(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

create table if not exists public.stock_settings (
  item_key text primary key,
  initial_stock integer not null default 0 check (initial_stock >= 0),
  updated_at timestamptz not null default now()
);

insert into public.stock_settings(item_key)
values ('BILLY'), ('TOOTSIE'), ('HUNNIE'), ('DRAGON WARRIOR'), ('VOICE')
on conflict (item_key) do nothing;

insert into public.dashboard_accounts(username, display_name, role, password_hash)
values ('admin', 'Admin', 'admin', crypt('demo1234', gen_salt('bf')))
on conflict (username) do nothing;

create or replace function public.dashboard_login(p_username text, p_password text)
returns table(session_token uuid, account_id uuid, username text, display_name text, role text)
language plpgsql security definer set search_path = public, extensions as $$
declare account public.dashboard_accounts; new_token uuid;
begin
  select * into account from public.dashboard_accounts
  where dashboard_accounts.username = lower(trim(p_username)) and active = true;
  if account.id is null or account.password_hash <> crypt(p_password, account.password_hash) then return; end if;
  delete from public.dashboard_sessions where expires_at <= now();
  insert into public.dashboard_sessions(account_id) values(account.id) returning token into new_token;
  return query select new_token, account.id, account.username, account.display_name, account.role;
end $$;

create or replace function public.dashboard_is_admin(p_token uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists(
    select 1 from public.dashboard_sessions s
    join public.dashboard_accounts a on a.id = s.account_id
    where s.token = p_token and s.expires_at > now() and a.active and a.role = 'admin'
  )
$$;

create or replace function public.dashboard_list_accounts(p_session_token uuid)
returns table(account_id uuid, username text, display_name text, role text, active boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.dashboard_is_admin(p_session_token) then raise exception 'ADMIN_REQUIRED'; end if;
  return query select a.id, a.username, a.display_name, a.role, a.active from public.dashboard_accounts a order by a.username;
end $$;

create or replace function public.dashboard_create_account(
  p_session_token uuid, p_username text, p_display_name text, p_role text, p_password text
) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.dashboard_is_admin(p_session_token) then raise exception 'ADMIN_REQUIRED'; end if;
  if length(p_password) < 8 then raise exception 'PASSWORD_TOO_SHORT'; end if;
  insert into public.dashboard_accounts(username, display_name, role, password_hash)
  values(lower(trim(p_username)), trim(p_display_name), p_role, crypt(p_password, gen_salt('bf')));
end $$;

create or replace function public.dashboard_update_account(
  p_session_token uuid, p_account_id uuid, p_display_name text, p_role text, p_active boolean, p_new_password text default null
) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.dashboard_is_admin(p_session_token) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_new_password is not null and length(p_new_password) < 8 then raise exception 'PASSWORD_TOO_SHORT'; end if;
  update public.dashboard_accounts set
    display_name = trim(p_display_name), role = p_role, active = p_active,
    password_hash = case when p_new_password is null then password_hash else crypt(p_new_password, gen_salt('bf')) end,
    updated_at = now()
  where id = p_account_id;
  if not p_active then delete from public.dashboard_sessions where account_id = p_account_id; end if;
end $$;

alter table public.fulfilment_orders enable row level security;
alter table public.activity_events enable row level security;
alter table public.payment_processor_settings enable row level security;
alter table public.sales_fee_settings enable row level security;
alter table public.dashboard_accounts enable row level security;
alter table public.dashboard_sessions enable row level security;
alter table public.stock_settings enable row level security;

drop policy if exists "shared dashboard reads orders" on public.fulfilment_orders;
drop policy if exists "shared dashboard inserts orders" on public.fulfilment_orders;
drop policy if exists "shared dashboard updates orders" on public.fulfilment_orders;
drop policy if exists "shared dashboard deletes orders" on public.fulfilment_orders;
create policy "shared dashboard reads orders" on public.fulfilment_orders for select to anon, authenticated using (true);
create policy "shared dashboard inserts orders" on public.fulfilment_orders for insert to anon, authenticated with check (true);
create policy "shared dashboard updates orders" on public.fulfilment_orders for update to anon, authenticated using (true) with check (true);
create policy "shared dashboard deletes orders" on public.fulfilment_orders for delete to anon, authenticated using (true);

drop policy if exists "shared dashboard reads activity" on public.activity_events;
drop policy if exists "shared dashboard inserts activity" on public.activity_events;
create policy "shared dashboard reads activity" on public.activity_events for select to anon, authenticated using (true);
create policy "shared dashboard inserts activity" on public.activity_events for insert to anon, authenticated with check (true);

drop policy if exists "shared dashboard reads processor settings" on public.payment_processor_settings;
drop policy if exists "shared dashboard inserts processor settings" on public.payment_processor_settings;
drop policy if exists "shared dashboard updates processor settings" on public.payment_processor_settings;
create policy "shared dashboard reads processor settings" on public.payment_processor_settings for select to anon, authenticated using (true);
create policy "shared dashboard inserts processor settings" on public.payment_processor_settings for insert to anon, authenticated with check (true);
create policy "shared dashboard updates processor settings" on public.payment_processor_settings for update to anon, authenticated using (true) with check (true);

drop policy if exists "shared dashboard reads sales fee settings" on public.sales_fee_settings;
drop policy if exists "shared dashboard inserts sales fee settings" on public.sales_fee_settings;
drop policy if exists "shared dashboard updates sales fee settings" on public.sales_fee_settings;
create policy "shared dashboard reads sales fee settings" on public.sales_fee_settings for select to anon, authenticated using (true);
create policy "shared dashboard inserts sales fee settings" on public.sales_fee_settings for insert to anon, authenticated with check (true);
create policy "shared dashboard updates sales fee settings" on public.sales_fee_settings for update to anon, authenticated using (true) with check (true);

drop policy if exists "shared dashboard reads stock settings" on public.stock_settings;
drop policy if exists "shared dashboard updates stock settings" on public.stock_settings;
create policy "shared dashboard reads stock settings" on public.stock_settings for select to anon, authenticated using (true);
create policy "shared dashboard updates stock settings" on public.stock_settings for insert to anon, authenticated with check (true);
create policy "shared dashboard changes stock settings" on public.stock_settings for update to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.fulfilment_orders to anon, authenticated;
grant select, insert on public.activity_events to anon, authenticated;
grant select, insert, update on public.payment_processor_settings to anon, authenticated;
grant select, insert, update on public.sales_fee_settings to anon, authenticated;
grant select, insert, update on public.stock_settings to anon, authenticated;
grant execute on function public.dashboard_login(text, text) to anon, authenticated;
grant execute on function public.dashboard_list_accounts(uuid) to anon, authenticated;
grant execute on function public.dashboard_create_account(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.dashboard_update_account(uuid, uuid, text, text, boolean, text) to anon, authenticated;
revoke all on public.dashboard_accounts from anon, authenticated;
revoke all on public.dashboard_sessions from anon, authenticated;
revoke execute on function public.dashboard_is_admin(uuid) from anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('accounting-documents', 'accounting-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.accounting_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'income', 'expense', 'cost_of_sales')),
  report_section text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_documents (
  id text primary key,
  file_path text not null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null default 0,
  name text not null,
  supplier text not null default '',
  description text not null default '',
  document_date date not null default current_date,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  category_id uuid references public.accounting_categories(id) on delete set null,
  transaction_type text not null default 'expense' check (transaction_type in ('income', 'expense')),
  tax_treatment text not null default 'none',
  notes text not null default '',
  uploaded_by text not null default 'System',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.accounting_transactions (
  id text primary key,
  source text not null default 'manual' check (source in ('manual', 'document', 'order')),
  source_id text,
  document_id text references public.accounting_documents(id) on delete set null,
  transaction_date date not null default current_date,
  description text not null,
  account_name text not null default 'Cash',
  category_id uuid references public.accounting_categories(id) on delete set null,
  transaction_type text not null default 'expense' check (transaction_type in ('income', 'expense', 'transfer')),
  debit numeric(12,2) not null default 0 check (debit >= 0),
  credit numeric(12,2) not null default 0 check (credit >= 0),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  currency text not null default 'MYR',
  tax_treatment text not null default 'none',
  notes text not null default '',
  created_by text not null default 'System',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

insert into public.accounting_categories(name, account_type, report_section)
values
  ('Sales Revenue', 'income', 'Revenue'),
  ('Shipping Revenue', 'income', 'Revenue'),
  ('Product Cost', 'cost_of_sales', 'Cost of Sales'),
  ('Shipping Cost', 'cost_of_sales', 'Cost of Sales'),
  ('Payment Processing Fees', 'expense', 'Expenses'),
  ('Shopify Fees', 'expense', 'Expenses'),
  ('Marketing', 'expense', 'Expenses'),
  ('Packaging', 'expense', 'Expenses'),
  ('Office & Admin', 'expense', 'Expenses'),
  ('Bank Charges', 'expense', 'Expenses'),
  ('Cash', 'asset', 'Assets'),
  ('Bank Account', 'asset', 'Assets')
on conflict (name) do nothing;

alter table public.accounting_categories enable row level security;
alter table public.accounting_documents enable row level security;
alter table public.accounting_transactions enable row level security;

drop policy if exists "shared accounting reads categories" on public.accounting_categories;
drop policy if exists "shared accounting changes categories" on public.accounting_categories;
create policy "shared accounting reads categories" on public.accounting_categories for select to anon, authenticated using (true);
create policy "shared accounting changes categories" on public.accounting_categories for all to anon, authenticated using (true) with check (true);

drop policy if exists "shared accounting reads documents" on public.accounting_documents;
drop policy if exists "shared accounting changes documents" on public.accounting_documents;
create policy "shared accounting reads documents" on public.accounting_documents for select to anon, authenticated using (true);
create policy "shared accounting changes documents" on public.accounting_documents for all to anon, authenticated using (true) with check (true);

drop policy if exists "shared accounting reads transactions" on public.accounting_transactions;
drop policy if exists "shared accounting changes transactions" on public.accounting_transactions;
create policy "shared accounting reads transactions" on public.accounting_transactions for select to anon, authenticated using (true);
create policy "shared accounting changes transactions" on public.accounting_transactions for all to anon, authenticated using (true) with check (true);

drop policy if exists "shared accounting reads document files" on storage.objects;
drop policy if exists "shared accounting inserts document files" on storage.objects;
drop policy if exists "shared accounting updates document files" on storage.objects;
drop policy if exists "shared accounting deletes document files" on storage.objects;
create policy "shared accounting reads document files" on storage.objects for select to anon, authenticated using (bucket_id = 'accounting-documents');
create policy "shared accounting inserts document files" on storage.objects for insert to anon, authenticated with check (bucket_id = 'accounting-documents');
create policy "shared accounting updates document files" on storage.objects for update to anon, authenticated using (bucket_id = 'accounting-documents') with check (bucket_id = 'accounting-documents');
create policy "shared accounting deletes document files" on storage.objects for delete to anon, authenticated using (bucket_id = 'accounting-documents');

grant select, insert, update, delete on public.accounting_categories to anon, authenticated;
grant select, insert, update, delete on public.accounting_documents to anon, authenticated;
grant select, insert, update, delete on public.accounting_transactions to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fulfilment_orders'
  ) then
    alter publication supabase_realtime add table public.fulfilment_orders;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_events'
  ) then
    alter publication supabase_realtime add table public.activity_events;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_processor_settings'
  ) then
    alter publication supabase_realtime add table public.payment_processor_settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sales_fee_settings'
  ) then
    alter publication supabase_realtime add table public.sales_fee_settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stock_settings'
  ) then
    alter publication supabase_realtime add table public.stock_settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'accounting_documents'
  ) then
    alter publication supabase_realtime add table public.accounting_documents;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'accounting_transactions'
  ) then
    alter publication supabase_realtime add table public.accounting_transactions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'accounting_categories'
  ) then
    alter publication supabase_realtime add table public.accounting_categories;
  end if;
end $$;
