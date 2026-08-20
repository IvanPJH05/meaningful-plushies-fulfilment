-- Secure deferred personalisation sessions. Access is server-side only via the
-- fulfilment app's Supabase service-role client; no anon policy is granted.
alter table public.customisation_sessions
  add column if not exists token_cipher text,
  add column if not exists fulfilment_order_id text;

create index if not exists customisation_sessions_fulfilment_order_id_idx
  on public.customisation_sessions (fulfilment_order_id)
  where fulfilment_order_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customisation-audio',
  'customisation-audio',
  false,
  52428800,
  array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/webm']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
