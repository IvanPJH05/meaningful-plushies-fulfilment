create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'staff');
create type public.order_status as enum (
  'new_order', 'awaiting_voice', 'ready_to_make', 'making',
  'ready_to_pack', 'packed', 'fulfilled', 'issue'
);
create type public.voice_upload_status as enum ('missing', 'received', 'checked');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.user_role not null default 'staff',
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique check (order_number ~ '^[0-9]+$'),
  shopify_order_gid text unique,
  order_date timestamptz,
  customer_name text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  product text not null default '',
  character text not null default '',
  voice_length integer check (voice_length is null or voice_length in (5, 10, 20)),
  plush_name text not null default '',
  certificate_code text unique,
  meaningful_note text not null default '',
  meaningful_message text not null default '',
  remark text not null default '',
  voice_upload_status public.voice_upload_status not null default 'missing',
  courier text not null default '',
  tracking_number text not null default '',
  status public.order_status not null default 'new_order',
  internal_notes text not null default '',
  photo_path text,
  raw_shopify jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.order_status not null,
  changed_by uuid references auth.users(id),
  note text,
  changed_at timestamptz not null default now()
);

create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  imported_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index orders_status_idx on public.orders(status);
create index orders_updated_at_idx on public.orders(updated_at desc);
create index orders_search_idx on public.orders using gin (
  to_tsvector('simple', order_number || ' ' || customer_name || ' ' || phone || ' ' || tracking_number)
);
create index status_history_order_idx on public.status_history(order_id, changed_at desc);

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger orders_touch_updated_at before update on public.orders
for each row execute function public.touch_updated_at();

create or replace function public.record_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status then
    insert into public.status_history(order_id, status, changed_by)
    values(new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;
create trigger orders_record_status after update of status on public.orders
for each row execute function public.record_status_change();

create or replace function public.staff_update_fulfilment(
  p_order_id uuid,
  p_status public.order_status,
  p_tracking_number text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare result public.orders;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.orders
  set status = p_status, tracking_number = coalesce(p_tracking_number, tracking_number)
  where id = p_order_id
  returning * into result;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  return result;
end;
$$;

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.status_history enable row level security;
alter table public.import_runs enable row level security;

create policy "users read own profile" on public.profiles
for select to authenticated using (id = auth.uid());
create policy "admins manage profiles" on public.profiles
for all to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

create policy "staff read orders" on public.orders
for select to authenticated using (true);
create policy "admins insert orders" on public.orders
for insert to authenticated with check (public.current_user_role() = 'admin');
create policy "admins update all order fields" on public.orders
for update to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

create policy "staff read status history" on public.status_history
for select to authenticated using (true);
create policy "admins read import runs" on public.import_runs
for select to authenticated using (public.current_user_role() = 'admin');
create policy "admins create import runs" on public.import_runs
for insert to authenticated with check (public.current_user_role() = 'admin');

grant execute on function public.staff_update_fulfilment(uuid, public.order_status, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fulfilment-photos', 'fulfilment-photos', false, 5000000, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "staff view fulfilment photos" on storage.objects
for select to authenticated using (bucket_id = 'fulfilment-photos');
create policy "admins upload fulfilment photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'fulfilment-photos' and public.current_user_role() = 'admin'
);
create policy "admins update fulfilment photos" on storage.objects
for update to authenticated using (
  bucket_id = 'fulfilment-photos' and public.current_user_role() = 'admin'
);
