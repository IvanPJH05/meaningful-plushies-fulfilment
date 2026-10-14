create table public.certificate_sync_jobs (
  order_id text primary key references public.fulfilment_orders(id) on delete cascade,
  revision integer not null default 1,
  synced_revision integer not null default 0,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  synced_at timestamptz
);
alter table public.certificate_sync_jobs enable row level security;
revoke all on public.certificate_sync_jobs from public, anon, authenticated;
grant all on public.certificate_sync_jobs to service_role;
create index certificate_sync_due on public.certificate_sync_jobs(next_attempt_at) where revision > synced_revision;

create function public.queue_certificate_sync() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  keys text[] := array['plushName','plushGender','plushBirthDate','plushBirthPlace','plushFavouritePerson','plushBelongsTo','meaningfulNote','product','character','certificateCode'];
  changed boolean;
begin
  if tg_op = 'UPDATE' then
    select exists(select 1 from unnest(keys) k where old.data->k is distinct from new.data->k) into changed;
    if not changed then return new; end if;
  end if;
  if coalesce(new.data->>'certificateCode','') = '' and not exists (
    select 1 from public.customisation_sessions s where s.fulfilment_order_id = new.id and s.certificate_metaobject_id is not null
  ) then return new; end if;
  insert into public.certificate_sync_jobs(order_id) values(new.id)
    on conflict(order_id) do update set revision = public.certificate_sync_jobs.revision + 1,
      next_attempt_at = now(), attempts = 0, last_error = null;
  return new;
end;
$$;
revoke all on function public.queue_certificate_sync() from public, anon, authenticated;
grant execute on function public.queue_certificate_sync() to service_role;
create trigger fulfilment_certificate_sync after insert or update of data on public.fulfilment_orders
for each row execute function public.queue_certificate_sync();

-- Enable the durable wake-up transport. The worker secret is provisioned in
-- Vault and Vercel separately and is never committed to source control.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('fulfilment-certificate-sync', '* * * * *', $job$
  select net.http_post(
    url := 'https://meaningful-plushies-fulfilment.vercel.app/api/fulfilment/certificates/process',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'certificate_sync_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) where exists(select 1 from public.certificate_sync_jobs where revision > synced_revision
      and next_attempt_at <= now() and (lease_until is null or lease_until < now()));
$job$);
