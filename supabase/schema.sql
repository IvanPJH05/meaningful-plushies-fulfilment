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
  on public.fulfilment_orders (order_number, id);
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

alter table public.fulfilment_orders add column if not exists meta_capi_sent_at timestamptz;
alter table public.fulfilment_orders add column if not exists meta_capi_event_id text;
alter table public.fulfilment_orders add column if not exists meta_capi_value_sent numeric(12,2);
alter table public.fulfilment_orders add column if not exists meta_capi_response_id text;
alter table public.fulfilment_orders add column if not exists meta_capi_status text;
alter table public.fulfilment_orders add column if not exists meta_capi_error text;

create index if not exists fulfilment_orders_meta_capi_status_idx
  on public.fulfilment_orders (meta_capi_status, meta_capi_sent_at desc);

create table if not exists public.meta_capi_settings (
  id text primary key default 'default' check (id = 'default'),
  enabled boolean not null default false,
  purchase_mode text not null default 'manual_only' check (purchase_mode in ('manual_only', 'all', 'disabled')),
  test_event_code text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.meta_capi_settings(id, enabled, purchase_mode)
values ('default', false, 'manual_only')
on conflict (id) do nothing;

create table if not exists public.meta_capi_logs (
  id text primary key,
  order_id text,
  order_number text not null default '',
  event_name text not null default 'Purchase',
  event_id text not null default '',
  value numeric(12,2) not null default 0,
  currency text not null default 'MYR',
  status text not null check (status in ('success', 'failed', 'needs_review', 'skipped')),
  response_id text not null default '',
  error text not null default '',
  request_summary jsonb not null default '{}'::jsonb,
  response_body jsonb not null default '{}'::jsonb,
  test_event_code text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists meta_capi_logs_created_idx
  on public.meta_capi_logs (created_at desc);
create index if not exists meta_capi_logs_order_idx
  on public.meta_capi_logs (order_number, event_id);

create table if not exists public.envelope_print_settings (
  id text primary key default 'default' check (id = 'default'),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.envelope_print_settings(id)
values ('default')
on conflict (id) do nothing;

create table if not exists public.dashboard_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username = lower(username) and username ~ '^[^[:space:]]{3,254}$'),
  display_name text not null,
  role text not null check (role in ('admin', 'staff', 'creator')),
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.dashboard_accounts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%username%'
  limit 1;
  if constraint_name is not null then
    execute format('alter table public.dashboard_accounts drop constraint %I', constraint_name);
  end if;
  alter table public.dashboard_accounts
    add constraint dashboard_accounts_username_check check (username = lower(username) and username ~ '^[^[:space:]]{3,254}$');
exception
  when duplicate_object then null;
end $$;

do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.dashboard_accounts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%role%'
    and pg_get_constraintdef(oid) like '%staff%';
  if constraint_name is not null then
    execute format('alter table public.dashboard_accounts drop constraint %I', constraint_name);
  end if;
  alter table public.dashboard_accounts
    add constraint dashboard_accounts_role_check check (role in ('admin', 'staff', 'creator'));
exception
  when duplicate_object then null;
end $$;

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

create table if not exists public.sales_consumption_mappings (
  id text primary key,
  sku text not null,
  inventory_item text not null default '',
  quantity_per_sale numeric(12,4) not null default 0 check (quantity_per_sale >= 0),
  operating_expense_per_sale numeric(12,2) not null default 0 check (operating_expense_per_sale >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_consumption_mappings_sku_idx
  on public.sales_consumption_mappings (sku, active);

create table if not exists public.creator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.dashboard_accounts(id) on delete cascade,
  display_name text not null,
  email text not null default '',
  phone text not null default '',
  tiktok_url text not null default '',
  instagram_url text not null default '',
  discount_code text not null,
  commission_rate numeric(8,4) not null default 10 check (commission_rate >= 0),
  current_tier text not null default 'tier_1' check (current_tier in ('tier_1', 'tier_2', 'tier_3', 'tier_4')),
  status text not null default 'pending' check (status in ('active', 'suspended', 'pending')),
  payout_method text not null default '',
  payout_account_name text not null default '',
  payout_account_number text not null default '',
  payout_notes text not null default '',
  internal_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creator_profiles add column if not exists payout_method text not null default '';
alter table public.creator_profiles add column if not exists payout_account_name text not null default '';
alter table public.creator_profiles add column if not exists payout_account_number text not null default '';
alter table public.creator_profiles add column if not exists payout_notes text not null default '';

create unique index if not exists creator_profiles_discount_code_lower_idx
  on public.creator_profiles (lower(discount_code));

create table if not exists public.creator_commissions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles(id) on delete cascade,
  shopify_order_id text not null,
  order_number text not null,
  order_date timestamptz,
  eligible_subtotal numeric(12,2) not null default 0 check (eligible_subtotal >= 0),
  discount_code_used text not null default '',
  commission_rate_at_sale numeric(8,4) not null default 0 check (commission_rate_at_sale >= 0),
  tier_at_sale text not null default 'tier_1' check (tier_at_sale in ('tier_1', 'tier_2', 'tier_3', 'tier_4')),
  commission_amount numeric(12,2) not null default 0 check (commission_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'cancelled')),
  payout_reference text not null default '',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists creator_commissions_order_creator_idx
  on public.creator_commissions (shopify_order_id, creator_id);

create index if not exists creator_commissions_creator_status_idx
  on public.creator_commissions (creator_id, status, order_date desc);

create table if not exists public.creator_payouts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles(id) on delete cascade,
  payout_month date not null,
  approved_commission_amount numeric(12,2) not null default 0 check (approved_commission_amount >= 0),
  bonus_amount numeric(12,2) not null default 0 check (bonus_amount >= 0),
  retainer_amount numeric(12,2) not null default 0 check (retainer_amount >= 0),
  total_payout_amount numeric(12,2) not null default 0 check (total_payout_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'cancelled')),
  payment_reference text not null default '',
  proof_file_name text not null default '',
  proof_file_type text not null default '',
  proof_file_data_url text not null default '',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.creator_payouts add column if not exists proof_file_name text not null default '';
alter table public.creator_payouts add column if not exists proof_file_type text not null default '';
alter table public.creator_payouts add column if not exists proof_file_data_url text not null default '';

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

create or replace function public.dashboard_delete_account(
  p_session_token uuid, p_account_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.dashboard_is_admin(p_session_token) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_account_id = (
    select s.account_id
    from public.dashboard_sessions s
    where s.token = p_session_token and s.expires_at > now()
    limit 1
  ) then
    raise exception 'CANNOT_DELETE_SELF';
  end if;
  delete from public.dashboard_accounts where id = p_account_id;
end $$;

create or replace function public.dashboard_session_role(p_token uuid)
returns table(account_id uuid, role text)
language sql security definer set search_path = public as $$
  select a.id, a.role
  from public.dashboard_sessions s
  join public.dashboard_accounts a on a.id = s.account_id
  where s.token = p_token and s.expires_at > now() and a.active
  limit 1
$$;

drop function if exists public.creator_list_profiles(uuid);
create or replace function public.creator_list_profiles(p_session_token uuid)
returns table(
  id uuid, user_id uuid, display_name text, email text, phone text, tiktok_url text,
  instagram_url text, discount_code text, commission_rate numeric, current_tier text,
  status text, payout_method text, payout_account_name text, payout_account_number text,
  payout_notes text, internal_notes text, created_at timestamptz, updated_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare session_account uuid; session_role text;
begin
  select dashboard_session_role.account_id, dashboard_session_role.role into session_account, session_role
  from public.dashboard_session_role(p_session_token);
  if session_account is null then raise exception 'LOGIN_REQUIRED'; end if;
  if session_role = 'admin' then
    return query select p.id, p.user_id, p.display_name, p.email, p.phone, p.tiktok_url,
      p.instagram_url, p.discount_code, p.commission_rate, p.current_tier, p.status,
      p.payout_method, p.payout_account_name, p.payout_account_number, p.payout_notes,
      p.internal_notes, p.created_at, p.updated_at
    from public.creator_profiles p
    order by p.display_name;
  elsif session_role = 'creator' then
    return query select p.id, p.user_id, p.display_name, p.email, p.phone, p.tiktok_url,
      p.instagram_url, p.discount_code, p.commission_rate, p.current_tier, p.status,
      p.payout_method, p.payout_account_name, p.payout_account_number, p.payout_notes,
      ''::text as internal_notes, p.created_at, p.updated_at
    from public.creator_profiles p
    where p.user_id = session_account
    order by p.display_name;
  else
    raise exception 'CREATOR_ACCESS_REQUIRED';
  end if;
end $$;

create or replace function public.creator_save_profile(
  p_session_token uuid, p_id uuid, p_user_id uuid, p_display_name text, p_email text,
  p_phone text, p_tiktok_url text, p_instagram_url text, p_discount_code text,
  p_commission_rate numeric, p_current_tier text, p_status text, p_internal_notes text
) returns uuid language plpgsql security definer set search_path = public as $$
declare saved_id uuid;
begin
  if not public.dashboard_is_admin(p_session_token) then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.dashboard_accounts where id = p_user_id and role = 'creator') then
    raise exception 'CREATOR_ACCOUNT_REQUIRED';
  end if;
  if trim(coalesce(p_discount_code, '')) = '' then raise exception 'DISCOUNT_CODE_REQUIRED'; end if;
  insert into public.creator_profiles(
    id, user_id, display_name, email, phone, tiktok_url, instagram_url,
    discount_code, commission_rate, current_tier, status, internal_notes, updated_at
  )
  values(
    coalesce(p_id, gen_random_uuid()), p_user_id, trim(p_display_name), trim(coalesce(p_email, '')),
    trim(coalesce(p_phone, '')), trim(coalesce(p_tiktok_url, '')), trim(coalesce(p_instagram_url, '')),
    upper(trim(p_discount_code)), greatest(0, coalesce(p_commission_rate, 0)),
    p_current_tier, p_status, trim(coalesce(p_internal_notes, '')), now()
  )
  on conflict (id) do update set
    user_id = excluded.user_id,
    display_name = excluded.display_name,
    email = excluded.email,
    phone = excluded.phone,
    tiktok_url = excluded.tiktok_url,
    instagram_url = excluded.instagram_url,
    discount_code = excluded.discount_code,
    commission_rate = excluded.commission_rate,
    current_tier = excluded.current_tier,
    status = excluded.status,
    internal_notes = excluded.internal_notes,
    updated_at = now()
  returning id into saved_id;
  return saved_id;
end $$;

create or replace function public.creator_list_commissions(p_session_token uuid)
returns table(
  id uuid, creator_id uuid, shopify_order_id text, order_number text, order_date timestamptz,
  eligible_subtotal numeric, discount_code_used text, commission_rate_at_sale numeric,
  tier_at_sale text, commission_amount numeric, status text, payout_reference text,
  paid_at timestamptz, created_at timestamptz, updated_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare session_account uuid; session_role text; session_creator_id uuid;
begin
  select dashboard_session_role.account_id, dashboard_session_role.role into session_account, session_role
  from public.dashboard_session_role(p_session_token);
  if session_account is null then raise exception 'LOGIN_REQUIRED'; end if;
  if session_role = 'admin' then
    return query select c.id, c.creator_id, c.shopify_order_id, c.order_number, c.order_date,
      c.eligible_subtotal, c.discount_code_used, c.commission_rate_at_sale, c.tier_at_sale,
      c.commission_amount, c.status, c.payout_reference, c.paid_at, c.created_at, c.updated_at
    from public.creator_commissions c
    order by c.order_date desc nulls last, c.created_at desc;
  elsif session_role = 'creator' then
    select p.id into session_creator_id from public.creator_profiles p where p.user_id = session_account;
    return query select c.id, c.creator_id, c.shopify_order_id, c.order_number, c.order_date,
      c.eligible_subtotal, c.discount_code_used, c.commission_rate_at_sale, c.tier_at_sale,
      c.commission_amount, c.status, ''::text as payout_reference, c.paid_at, c.created_at, c.updated_at
    from public.creator_commissions c
    where c.creator_id = session_creator_id
    order by c.order_date desc nulls last, c.created_at desc;
  else
    raise exception 'CREATOR_ACCESS_REQUIRED';
  end if;
end $$;

create or replace function public.creator_update_commission_status(
  p_session_token uuid, p_commission_id uuid, p_status text, p_payout_reference text default null, p_paid_at timestamptz default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.dashboard_is_admin(p_session_token) then raise exception 'ADMIN_REQUIRED'; end if;
  update public.creator_commissions set
    status = p_status,
    payout_reference = coalesce(p_payout_reference, payout_reference),
    paid_at = case when p_status = 'paid' then coalesce(p_paid_at, now()) else paid_at end,
    updated_at = now()
  where id = p_commission_id;
end $$;

create or replace function public.creator_save_payout_info(
  p_session_token uuid, p_payout_method text, p_payout_account_name text,
  p_payout_account_number text, p_payout_notes text
) returns void language plpgsql security definer set search_path = public as $$
declare session_account uuid; session_role text;
begin
  select dashboard_session_role.account_id, dashboard_session_role.role into session_account, session_role
  from public.dashboard_session_role(p_session_token);
  if session_account is null then raise exception 'LOGIN_REQUIRED'; end if;
  if session_role <> 'creator' then raise exception 'CREATOR_ACCESS_REQUIRED'; end if;
  update public.creator_profiles set
    payout_method = trim(coalesce(p_payout_method, '')),
    payout_account_name = trim(coalesce(p_payout_account_name, '')),
    payout_account_number = trim(coalesce(p_payout_account_number, '')),
    payout_notes = trim(coalesce(p_payout_notes, '')),
    updated_at = now()
  where user_id = session_account;
end $$;

drop function if exists public.creator_list_payouts(uuid);
create or replace function public.creator_list_payouts(p_session_token uuid)
returns table(
  id uuid, creator_id uuid, payout_month date, approved_commission_amount numeric,
  bonus_amount numeric, retainer_amount numeric, total_payout_amount numeric, status text,
  payment_reference text, proof_file_name text, proof_file_type text, proof_file_data_url text,
  paid_at timestamptz, created_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare session_account uuid; session_role text; session_creator_id uuid;
begin
  select dashboard_session_role.account_id, dashboard_session_role.role into session_account, session_role
  from public.dashboard_session_role(p_session_token);
  if session_account is null then raise exception 'LOGIN_REQUIRED'; end if;
  if session_role = 'admin' then
    return query select p.id, p.creator_id, p.payout_month, p.approved_commission_amount,
      p.bonus_amount, p.retainer_amount, p.total_payout_amount, p.status,
      p.payment_reference, p.proof_file_name, p.proof_file_type, p.proof_file_data_url,
      p.paid_at, p.created_at
    from public.creator_payouts p
    order by p.payout_month desc;
  elsif session_role = 'creator' then
    select p.id into session_creator_id from public.creator_profiles p where p.user_id = session_account;
    return query select p.id, p.creator_id, p.payout_month, p.approved_commission_amount,
      p.bonus_amount, p.retainer_amount, p.total_payout_amount, p.status,
      p.payment_reference, ''::text as proof_file_name, ''::text as proof_file_type, ''::text as proof_file_data_url,
      p.paid_at, p.created_at
    from public.creator_payouts p
    where p.creator_id = session_creator_id
    order by p.payout_month desc;
  else
    raise exception 'CREATOR_ACCESS_REQUIRED';
  end if;
end $$;

create or replace function public.creator_save_payout(
  p_session_token uuid, p_id uuid, p_creator_id uuid, p_payout_month date,
  p_approved_commission_amount numeric, p_bonus_amount numeric, p_retainer_amount numeric,
  p_status text, p_payment_reference text, p_proof_file_name text, p_proof_file_type text,
  p_proof_file_data_url text, p_paid_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare saved_id uuid; total_amount numeric;
begin
  if not public.dashboard_is_admin(p_session_token) then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.creator_profiles where id = p_creator_id) then
    raise exception 'CREATOR_REQUIRED';
  end if;
  total_amount := greatest(0, coalesce(p_approved_commission_amount, 0))
    + greatest(0, coalesce(p_bonus_amount, 0))
    + greatest(0, coalesce(p_retainer_amount, 0));
  insert into public.creator_payouts(
    id, creator_id, payout_month, approved_commission_amount, bonus_amount, retainer_amount,
    total_payout_amount, status, payment_reference, proof_file_name, proof_file_type,
    proof_file_data_url, paid_at
  )
  values(
    coalesce(p_id, gen_random_uuid()), p_creator_id, coalesce(p_payout_month, date_trunc('month', now())::date),
    greatest(0, coalesce(p_approved_commission_amount, 0)), greatest(0, coalesce(p_bonus_amount, 0)),
    greatest(0, coalesce(p_retainer_amount, 0)), total_amount, p_status,
    trim(coalesce(p_payment_reference, '')), trim(coalesce(p_proof_file_name, '')),
    trim(coalesce(p_proof_file_type, '')), coalesce(p_proof_file_data_url, ''),
    case when p_status = 'paid' then coalesce(p_paid_at, now()) else p_paid_at end
  )
  on conflict (id) do update set
    creator_id = excluded.creator_id,
    payout_month = excluded.payout_month,
    approved_commission_amount = excluded.approved_commission_amount,
    bonus_amount = excluded.bonus_amount,
    retainer_amount = excluded.retainer_amount,
    total_payout_amount = excluded.total_payout_amount,
    status = excluded.status,
    payment_reference = excluded.payment_reference,
    proof_file_name = excluded.proof_file_name,
    proof_file_type = excluded.proof_file_type,
    proof_file_data_url = excluded.proof_file_data_url,
    paid_at = excluded.paid_at
  returning id into saved_id;
  if p_status = 'paid' then
    update public.creator_commissions set
      status = 'paid',
      payout_reference = trim(coalesce(p_payment_reference, '')),
      paid_at = coalesce(p_paid_at, now()),
      updated_at = now()
    where creator_id = p_creator_id and status in ('pending', 'approved');
  end if;
  return saved_id;
end $$;

create or replace function public.creator_tier_for_counts(p_lifetime_sales integer, p_month_sales integer)
returns table(tier text, rate numeric) language sql immutable as $$
  select case
    when coalesce(p_month_sales, 0) >= 500 then 'tier_4'
    when coalesce(p_month_sales, 0) >= 100 then 'tier_3'
    when coalesce(p_lifetime_sales, 0) >= 50 then 'tier_2'
    else 'tier_1'
  end,
  case
    when coalesce(p_month_sales, 0) >= 500 then 25::numeric
    when coalesce(p_month_sales, 0) >= 100 then 20::numeric
    when coalesce(p_lifetime_sales, 0) >= 50 then 15::numeric
    else 10::numeric
  end
$$;

create or replace function public.creator_recalculate_tiers()
returns integer language plpgsql security definer set search_path = public as $$
declare updated_count integer := 0;
begin
  with counts as (
    select
      p.id,
      count(c.id)::integer as lifetime_sales,
      count(c.id) filter (
        where date_trunc('month', coalesce(c.order_date, c.created_at)) = date_trunc('month', now())
      )::integer as month_sales
    from public.creator_profiles p
    left join public.creator_commissions c
      on c.creator_id = p.id
     and c.status <> 'cancelled'
    group by p.id
  ),
  tiers as (
    select counts.id, next_tier.tier, next_tier.rate
    from counts
    cross join lateral public.creator_tier_for_counts(counts.lifetime_sales, counts.month_sales) next_tier
  )
  update public.creator_profiles p set
    current_tier = tiers.tier,
    commission_rate = tiers.rate,
    updated_at = now()
  from tiers
  where p.id = tiers.id
    and (p.current_tier is distinct from tiers.tier or p.commission_rate is distinct from tiers.rate);
  get diagnostics updated_count = row_count;
  return updated_count;
end $$;

create or replace function public.creator_sync_commissions()
returns integer language plpgsql security definer set search_path = public as $$
declare inserted_count integer := 0;
begin
  perform public.creator_recalculate_tiers();
  insert into public.creator_commissions(
    creator_id, shopify_order_id, order_number, order_date, eligible_subtotal,
    discount_code_used, commission_rate_at_sale, tier_at_sale, commission_amount, status, updated_at
  )
  select
    p.id,
    o.id,
    o.order_number,
    o.order_date,
    round(greatest(0, (
      coalesce((o.data->>'subtotalAmount')::numeric, 0)
      - coalesce((o.data->>'productDiscountAmount')::numeric, 0)
    ) / greatest(1, count(*) over (partition by o.order_number))), 2) as eligible_subtotal,
    matched.code,
    p.commission_rate,
    p.current_tier,
    round(greatest(0, (
      coalesce((o.data->>'subtotalAmount')::numeric, 0)
      - coalesce((o.data->>'productDiscountAmount')::numeric, 0)
    ) / greatest(1, count(*) over (partition by o.order_number))) * p.commission_rate / 100, 2) as commission_amount,
    'pending',
    now()
  from public.fulfilment_orders o
  cross join lateral (
    select code
    from (
      select jsonb_array_elements_text(case when jsonb_typeof(o.data->'discountCodes') = 'array' then o.data->'discountCodes' else '[]'::jsonb end) as code
      union all
      select o.data->>'discountCodeUsed'
    ) raw_codes
    where trim(coalesce(code, '')) <> ''
    limit 1
  ) matched
  join public.creator_profiles p
    on lower(p.discount_code) = lower(matched.code)
   and p.status = 'active'
  on conflict (shopify_order_id, creator_id) do update set
    order_number = excluded.order_number,
    order_date = excluded.order_date,
    eligible_subtotal = excluded.eligible_subtotal,
    discount_code_used = excluded.discount_code_used,
    updated_at = now()
  where public.creator_commissions.status = 'pending';
  get diagnostics inserted_count = row_count;
  perform public.creator_recalculate_tiers();
  return inserted_count;
end $$;

alter table public.fulfilment_orders enable row level security;
alter table public.activity_events enable row level security;
alter table public.payment_processor_settings enable row level security;
alter table public.sales_fee_settings enable row level security;
alter table public.meta_capi_settings enable row level security;
alter table public.meta_capi_logs enable row level security;
alter table public.envelope_print_settings enable row level security;
alter table public.dashboard_accounts enable row level security;
alter table public.dashboard_sessions enable row level security;
alter table public.stock_settings enable row level security;
alter table public.sales_consumption_mappings enable row level security;
alter table public.creator_profiles enable row level security;
alter table public.creator_commissions enable row level security;
alter table public.creator_payouts enable row level security;

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

drop policy if exists "shared dashboard reads meta capi settings" on public.meta_capi_settings;
drop policy if exists "shared dashboard inserts meta capi settings" on public.meta_capi_settings;
drop policy if exists "shared dashboard updates meta capi settings" on public.meta_capi_settings;
create policy "shared dashboard reads meta capi settings" on public.meta_capi_settings for select to anon, authenticated using (true);
create policy "shared dashboard inserts meta capi settings" on public.meta_capi_settings for insert to anon, authenticated with check (true);
create policy "shared dashboard updates meta capi settings" on public.meta_capi_settings for update to anon, authenticated using (true) with check (true);

drop policy if exists "shared dashboard reads meta capi logs" on public.meta_capi_logs;
drop policy if exists "shared dashboard inserts meta capi logs" on public.meta_capi_logs;
create policy "shared dashboard reads meta capi logs" on public.meta_capi_logs for select to anon, authenticated using (true);
create policy "shared dashboard inserts meta capi logs" on public.meta_capi_logs for insert to anon, authenticated with check (true);

drop policy if exists "shared dashboard reads envelope print settings" on public.envelope_print_settings;
drop policy if exists "shared dashboard inserts envelope print settings" on public.envelope_print_settings;
drop policy if exists "shared dashboard updates envelope print settings" on public.envelope_print_settings;
create policy "shared dashboard reads envelope print settings" on public.envelope_print_settings for select to anon, authenticated using (true);
create policy "shared dashboard inserts envelope print settings" on public.envelope_print_settings for insert to anon, authenticated with check (true);
create policy "shared dashboard updates envelope print settings" on public.envelope_print_settings for update to anon, authenticated using (true) with check (true);

drop policy if exists "shared dashboard reads stock settings" on public.stock_settings;
drop policy if exists "shared dashboard updates stock settings" on public.stock_settings;
create policy "shared dashboard reads stock settings" on public.stock_settings for select to anon, authenticated using (true);
create policy "shared dashboard updates stock settings" on public.stock_settings for insert to anon, authenticated with check (true);
create policy "shared dashboard changes stock settings" on public.stock_settings for update to anon, authenticated using (true) with check (true);

drop policy if exists "shared dashboard reads sales mappings" on public.sales_consumption_mappings;
drop policy if exists "shared dashboard inserts sales mappings" on public.sales_consumption_mappings;
drop policy if exists "shared dashboard updates sales mappings" on public.sales_consumption_mappings;
drop policy if exists "shared dashboard deletes sales mappings" on public.sales_consumption_mappings;
create policy "shared dashboard reads sales mappings" on public.sales_consumption_mappings for select to anon, authenticated using (true);
create policy "shared dashboard inserts sales mappings" on public.sales_consumption_mappings for insert to anon, authenticated with check (true);
create policy "shared dashboard updates sales mappings" on public.sales_consumption_mappings for update to anon, authenticated using (true) with check (true);
create policy "shared dashboard deletes sales mappings" on public.sales_consumption_mappings for delete to anon, authenticated using (true);

grant select, insert, update, delete on public.fulfilment_orders to anon, authenticated;
grant select, insert on public.activity_events to anon, authenticated;
grant select, insert, update on public.payment_processor_settings to anon, authenticated;
grant select, insert, update on public.sales_fee_settings to anon, authenticated;
grant select, insert, update on public.meta_capi_settings to anon, authenticated;
grant select, insert on public.meta_capi_logs to anon, authenticated;
grant select, insert, update on public.envelope_print_settings to anon, authenticated;
grant select, insert, update on public.stock_settings to anon, authenticated;
grant select, insert, update, delete on public.sales_consumption_mappings to anon, authenticated;
grant execute on function public.dashboard_login(text, text) to anon, authenticated;
grant execute on function public.dashboard_list_accounts(uuid) to anon, authenticated;
grant execute on function public.dashboard_create_account(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.dashboard_update_account(uuid, uuid, text, text, boolean, text) to anon, authenticated;
grant execute on function public.dashboard_delete_account(uuid, uuid) to anon, authenticated;
grant execute on function public.creator_list_profiles(uuid) to anon, authenticated;
grant execute on function public.creator_save_profile(uuid, uuid, uuid, text, text, text, text, text, text, numeric, text, text, text) to anon, authenticated;
grant execute on function public.creator_list_commissions(uuid) to anon, authenticated;
grant execute on function public.creator_update_commission_status(uuid, uuid, text, text, timestamptz) to anon, authenticated;
grant execute on function public.creator_save_payout_info(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.creator_list_payouts(uuid) to anon, authenticated;
grant execute on function public.creator_save_payout(uuid, uuid, uuid, date, numeric, numeric, numeric, text, text, text, text, text, timestamptz) to anon, authenticated;
grant execute on function public.creator_recalculate_tiers() to anon, authenticated;
grant execute on function public.creator_sync_commissions() to anon, authenticated;
revoke all on public.dashboard_accounts from anon, authenticated;
revoke all on public.dashboard_sessions from anon, authenticated;
revoke all on public.creator_profiles from anon, authenticated;
revoke all on public.creator_commissions from anon, authenticated;
revoke all on public.creator_payouts from anon, authenticated;
revoke execute on function public.dashboard_is_admin(uuid) from anon, authenticated;
revoke execute on function public.dashboard_session_role(uuid) from anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('accounting-documents', 'accounting-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.accounting_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'revenue', 'income', 'expense', 'cost_of_sales')),
  report_section text not null,
  parent_id uuid references public.accounting_categories(id) on delete set null,
  data_source_type text not null default 'manual' check (data_source_type in ('manual', 'system_generated', 'hybrid')),
  source_module text not null default 'Manual Transactions',
  source_entity text not null default '',
  posting_trigger text not null default 'Manual Entry',
  allow_sub_accounts boolean not null default false,
  allowed_transaction_types text[] not null default '{}',
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
  business_event text,
  transaction_date date not null default current_date,
  description text not null,
  account_name text not null default 'Cash',
  category_id uuid references public.accounting_categories(id) on delete set null,
  transaction_type text not null default 'expense' check (transaction_type in ('income', 'expense', 'transfer')),
  payment_status text not null default 'paid_in_full' check (payment_status in ('paid_in_full', 'deposit_paid', 'on_credit', 'paid_now', 'pay_later')),
  payment_method text not null default '',
  supplier text not null default '',
  quantity numeric(12,2) not null default 0 check (quantity >= 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  deposit_amount numeric(12,2) not null default 0 check (deposit_amount >= 0),
  invoice_number text not null default '',
  due_date date,
  supplier_terms text not null default '',
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

create table if not exists public.accounting_ledger_entries (
  id text primary key,
  transaction_id text not null references public.accounting_transactions(id) on delete cascade,
  account_id uuid references public.accounting_categories(id) on delete set null,
  account_name text not null,
  entry_type text not null check (entry_type in ('debit', 'credit')),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  memo text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.content_plan_items (
  id text primary key,
  title text not null,
  planned_date date not null,
  platform text not null default '',
  content_type text not null default '',
  notes text not null default '',
  posted boolean not null default false,
  posted_at timestamptz,
  created_by text not null default 'Admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_plan_items_planned_date_idx
  on public.content_plan_items (planned_date, created_at);
create index if not exists content_plan_items_posted_idx
  on public.content_plan_items (posted);

create table if not exists public.content_idea_items (
  id text primary key,
  title text not null,
  idea text not null default '',
  reference_links jsonb not null default '[]'::jsonb,
  created_by text not null default 'Admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_idea_items_updated_idx
  on public.content_idea_items (updated_at desc, created_at desc);

alter table public.accounting_transactions drop constraint if exists accounting_transactions_transaction_type_check;
alter table public.accounting_transactions add constraint accounting_transactions_transaction_type_check
  check (transaction_type in (
    'income', 'expense', 'transfer',
    'Revenue', 'Expense', 'Asset Purchase', 'Liability', 'Equity', 'Tax',
    'Inventory Purchase', 'Loan', 'Owner Contribution', 'Owner Withdrawal'
  ));

alter table public.accounting_documents drop constraint if exists accounting_documents_transaction_type_check;
alter table public.accounting_documents add constraint accounting_documents_transaction_type_check
  check (transaction_type in (
    'income', 'expense',
    'Revenue', 'Expense', 'Asset Purchase', 'Liability', 'Equity', 'Tax',
    'Inventory Purchase', 'Loan', 'Owner Contribution', 'Owner Withdrawal'
  ));

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
alter table public.accounting_ledger_entries enable row level security;
alter table public.content_plan_items enable row level security;
alter table public.content_idea_items enable row level security;

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

drop policy if exists "shared accounting reads ledger entries" on public.accounting_ledger_entries;
drop policy if exists "shared accounting changes ledger entries" on public.accounting_ledger_entries;
create policy "shared accounting reads ledger entries" on public.accounting_ledger_entries for select to anon, authenticated using (true);
create policy "shared accounting changes ledger entries" on public.accounting_ledger_entries for all to anon, authenticated using (true) with check (true);

drop policy if exists "shared content plan reads items" on public.content_plan_items;
drop policy if exists "shared content plan changes items" on public.content_plan_items;
create policy "shared content plan reads items" on public.content_plan_items for select to anon, authenticated using (true);
create policy "shared content plan changes items" on public.content_plan_items for all to anon, authenticated using (true) with check (true);

drop policy if exists "shared content ideas reads items" on public.content_idea_items;
drop policy if exists "shared content ideas changes items" on public.content_idea_items;
create policy "shared content ideas reads items" on public.content_idea_items for select to anon, authenticated using (true);
create policy "shared content ideas changes items" on public.content_idea_items for all to anon, authenticated using (true) with check (true);

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
grant select, insert, update, delete on public.accounting_ledger_entries to anon, authenticated;
grant select, insert, update, delete on public.content_plan_items to anon, authenticated;
grant select, insert, update, delete on public.content_idea_items to anon, authenticated;

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
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meta_capi_settings'
  ) then
    alter publication supabase_realtime add table public.meta_capi_settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meta_capi_logs'
  ) then
    alter publication supabase_realtime add table public.meta_capi_logs;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'envelope_print_settings'
  ) then
    alter publication supabase_realtime add table public.envelope_print_settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stock_settings'
  ) then
    alter publication supabase_realtime add table public.stock_settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sales_consumption_mappings'
  ) then
    alter publication supabase_realtime add table public.sales_consumption_mappings;
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
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'accounting_ledger_entries'
  ) then
    alter publication supabase_realtime add table public.accounting_ledger_entries;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'content_plan_items'
  ) then
    alter publication supabase_realtime add table public.content_plan_items;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'content_idea_items'
  ) then
    alter publication supabase_realtime add table public.content_idea_items;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'creator_profiles'
  ) then
    alter publication supabase_realtime add table public.creator_profiles;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'creator_commissions'
  ) then
    alter publication supabase_realtime add table public.creator_commissions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'creator_payouts'
  ) then
    alter publication supabase_realtime add table public.creator_payouts;
  end if;
end $$;
