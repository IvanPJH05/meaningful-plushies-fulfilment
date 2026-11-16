create table public.creator_vip_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^VIP-[0-9A-F]{8}-[0-9A-F]{8}$'),
  username text not null unique check (username ~ '^[a-z0-9._]{1,24}$'),
  discount_code text not null unique,
  sample_id uuid unique references public.creator_free_samples(id) on delete set null,
  activated_at timestamptz,
  registered_at timestamptz,
  name text,
  phone text unique,
  consent_version text,
  created_at timestamptz not null default now(),
  check (sample_id is null or (sample_id = id and activated_at is not null)),
  check (
    (registered_at is null and name is null and phone is null and consent_version is null)
    or (registered_at is not null and name is not null and phone is not null and consent_version is not null)
  )
);

alter table public.creator_vip_invites enable row level security;
revoke all on public.creator_vip_invites from public, anon, authenticated;
grant select, insert, update, delete on public.creator_vip_invites to service_role;
