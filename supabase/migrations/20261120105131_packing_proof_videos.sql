-- Internal staff evidence. Videos are never exposed through customer card links.
create table public.packing_proof_videos (
  id uuid primary key,
  order_id text not null references public.fulfilment_orders(id) on delete cascade,
  card_code text not null,
  order_barcode text not null,
  scanned_at timestamptz not null,
  source_started_at timestamptz not null,
  offset_ms integer not null check(offset_ms between 0 and 21000),
  source_path text not null unique,
  source_size integer not null check(source_size between 1 and 26214400),
  source_type text not null check(source_type in ('video/webm','video/mp4')),
  video_path text,
  video_size integer,
  status text not null default 'uploading' check(status in ('uploading','processing','ready','failed')),
  processing_token uuid,
  lease_until timestamptz,
  error text not null default '',
  created_by uuid not null references public.dashboard_accounts(id),
  created_at timestamptz not null default now(),
  saved_at timestamptz,
  check(status<>'ready' or (video_path is not null and video_size>0 and saved_at is not null))
);
create index packing_proof_order_idx on public.packing_proof_videos(order_id,scanned_at desc);
alter table public.packing_proof_videos enable row level security;
revoke all on public.packing_proof_videos from public,anon,authenticated;
grant select,insert,update on public.packing_proof_videos to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('packing-proof','packing-proof',false,26214400,array['video/webm','video/mp4']);
