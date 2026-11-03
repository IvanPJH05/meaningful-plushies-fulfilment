insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tiktok-tutorial', 'tiktok-tutorial', false, 100000000, array['video/mp4']);

create table public.tiktok_tutorial_settings (
  id boolean primary key default true check (id),
  video_path text,
  updated_at timestamptz not null default now()
);
insert into public.tiktok_tutorial_settings (id) values (true);
alter table public.tiktok_tutorial_settings enable row level security;
revoke all on public.tiktok_tutorial_settings from public, anon, authenticated;
grant select, update on public.tiktok_tutorial_settings to service_role;

create table public.tiktok_tutorial_deliveries (
  order_id text primary key references public.fulfilment_orders(id),
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','uncertain')),
  text_id text,
  video_id text,
  sent_at timestamptz,
  error text,
  retry_after timestamptz not null default now()
);
alter table public.tiktok_tutorial_deliveries enable row level security;
revoke all on public.tiktok_tutorial_deliveries from public, anon, authenticated;
grant select, insert, update on public.tiktok_tutorial_deliveries to service_role;
