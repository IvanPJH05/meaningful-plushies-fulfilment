create table if not exists public.creator_free_samples (
  id uuid primary key default gen_random_uuid(),
  creator_name text not null,
  creator_url text not null default '',
  sample_code text not null,
  shopify_discount_id text not null default '',
  order_number text not null default '',
  given_at timestamptz not null default now(),
  notes text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.creator_free_samples enable row level security;
revoke all on public.creator_free_samples from anon, authenticated;

drop function if exists public.creator_list_free_samples(uuid);
create or replace function public.creator_list_free_samples(p_session_token uuid)
returns table(
  id uuid, creator_name text, creator_url text, sample_code text,
  shopify_discount_id text, order_number text, given_at timestamptz, notes text
) language plpgsql security definer set search_path = public as $$
begin
  if not public.dashboard_is_admin(p_session_token) then raise exception 'ADMIN_REQUIRED'; end if;
  return query
    select s.id, s.creator_name, s.creator_url, s.sample_code,
      s.shopify_discount_id, s.order_number, s.given_at, s.notes
    from public.creator_free_samples s
    order by s.given_at desc, s.creator_name;
end $$;

drop function if exists public.creator_save_free_sample(uuid, uuid, text, text, text, text, text, timestamptz, text);
create or replace function public.creator_save_free_sample(
  p_session_token uuid, p_id uuid, p_creator_name text, p_creator_url text,
  p_sample_code text, p_shopify_discount_id text, p_order_number text,
  p_given_at timestamptz, p_notes text
) returns uuid language plpgsql security definer set search_path = public as $$
declare saved_id uuid;
begin
  if not public.dashboard_is_admin(p_session_token) then raise exception 'ADMIN_REQUIRED'; end if;
  if trim(coalesce(p_creator_name, '')) = '' then raise exception 'CREATOR_NAME_REQUIRED'; end if;
  if trim(coalesce(p_sample_code, '')) = '' then raise exception 'SAMPLE_CODE_REQUIRED'; end if;
  insert into public.creator_free_samples(
    id, creator_name, creator_url, sample_code, shopify_discount_id,
    order_number, given_at, notes, updated_at
  ) values (
    coalesce(p_id, gen_random_uuid()), trim(p_creator_name), trim(coalesce(p_creator_url, '')),
    upper(trim(p_sample_code)), trim(coalesce(p_shopify_discount_id, '')),
    trim(coalesce(p_order_number, '')), coalesce(p_given_at, now()), trim(coalesce(p_notes, '')), now()
  ) on conflict (id) do update set
    creator_name = excluded.creator_name,
    creator_url = excluded.creator_url,
    sample_code = excluded.sample_code,
    shopify_discount_id = excluded.shopify_discount_id,
    order_number = excluded.order_number,
    given_at = excluded.given_at,
    notes = excluded.notes,
    updated_at = now()
  returning id into saved_id;
  return saved_id;
end $$;

drop function if exists public.creator_import_free_sample(uuid, uuid, text, text, text, text, text, timestamptz, text);
create or replace function public.creator_import_free_sample(
  p_session_token uuid, p_id uuid, p_creator_name text, p_creator_url text,
  p_sample_code text, p_shopify_discount_id text, p_order_number text,
  p_given_at timestamptz, p_notes text
) returns uuid language plpgsql security definer set search_path = public as $$
declare saved_id uuid;
begin
  if not public.dashboard_is_admin(p_session_token) then raise exception 'ADMIN_REQUIRED'; end if;
  if trim(coalesce(p_creator_name, '')) = '' or trim(coalesce(p_sample_code, '')) = '' then return null; end if;
  insert into public.creator_free_samples(
    id, creator_name, creator_url, sample_code, shopify_discount_id,
    order_number, given_at, notes, updated_at
  ) values (
    coalesce(p_id, gen_random_uuid()), trim(p_creator_name), trim(coalesce(p_creator_url, '')),
    upper(trim(p_sample_code)), trim(coalesce(p_shopify_discount_id, '')),
    trim(coalesce(p_order_number, '')), coalesce(p_given_at, now()), trim(coalesce(p_notes, '')), now()
  ) on conflict (id) do nothing
  returning id into saved_id;
  return saved_id;
end $$;

drop function if exists public.creator_delete_free_sample(uuid, uuid);
create or replace function public.creator_delete_free_sample(p_session_token uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.dashboard_is_admin(p_session_token) then raise exception 'ADMIN_REQUIRED'; end if;
  delete from public.creator_free_samples where id = p_id;
end $$;

grant execute on function public.creator_list_free_samples(uuid) to anon, authenticated;
grant execute on function public.creator_save_free_sample(uuid, uuid, text, text, text, text, text, timestamptz, text) to anon, authenticated;
grant execute on function public.creator_import_free_sample(uuid, uuid, text, text, text, text, text, timestamptz, text) to anon, authenticated;
grant execute on function public.creator_delete_free_sample(uuid, uuid) to anon, authenticated;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'creator_free_samples'
  ) then
    alter publication supabase_realtime add table public.creator_free_samples;
  end if;
end $$;
