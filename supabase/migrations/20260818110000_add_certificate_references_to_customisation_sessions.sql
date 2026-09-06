alter table public.customisation_sessions
  add column if not exists certificate_code text,
  add column if not exists certificate_metaobject_id text;

create index if not exists customisation_sessions_certificate_code_idx
  on public.customisation_sessions (certificate_code)
  where certificate_code is not null;
