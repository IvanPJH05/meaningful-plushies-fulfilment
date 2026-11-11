create or replace function public.queue_certificate_sync() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  keys text[] := array['plushName','plushGender','plushBirthDate','plushBirthPlace','plushFavouritePerson','plushBelongsTo','meaningfulNote','product','character','certificateCode','meaningfulMessage','productType'];
  changed boolean;
begin
  if tg_op = 'UPDATE' then
    select exists(select 1 from unnest(keys) k where old.data->k is distinct from new.data->k) into changed;
    if not changed then return new; end if;
  end if;
  if new.data->>'productType' in ('plush_charm','snowy_charm')
    or concat(new.data->>'product',' ',new.data->>'remark') ~* '\m(plush\s*charms?)\M'
  then return new; end if;
  if coalesce(new.data->>'certificateCode','') = '' and not exists (
    select 1 from public.customisation_sessions s where s.fulfilment_order_id = new.id and s.certificate_metaobject_id is not null
  ) then return new; end if;
  -- TikTok order shells have no form details yet. Queue when a name arrives,
  -- not when TikTok merely refreshes tracking or buyer information.
  if new.data->>'salesChannel' = 'tiktok' and btrim(coalesce(new.data->>'plushName','')) = '' then return new; end if;
  insert into public.certificate_sync_jobs(order_id) values(new.id)
    on conflict(order_id) do update set revision = public.certificate_sync_jobs.revision + 1,
      next_attempt_at = now(), attempts = 0, last_error = null;
  return new;
end;
$$;
