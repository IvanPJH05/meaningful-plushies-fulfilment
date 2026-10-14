create function public.claim_certificate_sync(p_lease uuid) returns jsonb
language sql security invoker set search_path='' as $$
  with due as (
    select order_id from public.certificate_sync_jobs where revision>synced_revision and next_attempt_at<=now()
      and (lease_until is null or lease_until<now()) order by next_attempt_at limit 3 for update skip locked
  ), claimed as (
    update public.certificate_sync_jobs j set lease_token=p_lease,lease_until=now()+interval '5 minutes',attempts=attempts+1
      from due where j.order_id=due.order_id returning j.order_id,j.revision,j.attempts
  ) select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('data',
      o.data-'photoDataUrl'-'tikTokFileDataUrl')), '[]'::jsonb)
    from claimed c join public.fulfilment_orders o on o.id=c.order_id;
$$;
create function public.finish_certificate_sync(p_order text,p_lease uuid,p_revision integer,p_error text,p_delay integer) returns void
language sql security invoker set search_path='' as $$
  update public.certificate_sync_jobs set
    synced_revision=case when p_error is null then p_revision else synced_revision end,
    synced_at=case when p_error is null then now() else synced_at end,
    last_error=left(p_error,300),attempts=case when p_error is null then 0 else attempts end,
    lease_token=null,lease_until=null,
    next_attempt_at=case when p_error is null or revision>p_revision then now() else now()+least(3600,greatest(30,p_delay))*interval '1 second' end
  where order_id=p_order and lease_token=p_lease;
$$;
create function public.read_certificate_sync_link(p_order text,p_code text) returns jsonb
language sql security invoker set search_path='' as $$
  select jsonb_build_object('sessions',coalesce((select jsonb_agg(jsonb_build_object('certificate_code',certificate_code,'certificate_metaobject_id',certificate_metaobject_id))
    from public.customisation_sessions where fulfilment_order_id=p_order),'[]'::jsonb),
    'duplicate',exists(select 1 from public.fulfilment_orders where id<>p_order and data->>'certificateCode'=coalesce(nullif(p_code,''),
      (select certificate_code from public.customisation_sessions where fulfilment_order_id=p_order limit 1))));
$$;
create function public.read_certificate_sync_status(p_order text) returns jsonb
language sql security invoker set search_path='' as $$
  select jsonb_build_object('status',case
    when coalesce(o.data->>'certificateCode','')='' and not exists(select 1 from public.customisation_sessions where fulfilment_order_id=o.id and certificate_metaobject_id is not null) then 'unlinked'
    when j.revision>j.synced_revision and j.last_error is not null then 'retrying'
    when j.revision>j.synced_revision then 'pending'
    when j.synced_at is not null then 'synced' else 'not_checked' end,
    'error',case when j.revision>j.synced_revision then j.last_error end,'syncedAt',j.synced_at)
  from public.fulfilment_orders o left join public.certificate_sync_jobs j on j.order_id=o.id where o.id=p_order;
$$;
create function public.requeue_tiktok_certificates(p_ids text[]) returns integer
language sql security invoker set search_path='' as $$
  with queued as (
    insert into public.certificate_sync_jobs(order_id)
    select id from public.fulfilment_orders where id=any(p_ids) and data->>'salesChannel'='tiktok'
      and coalesce(data->>'certificateCode','')<>'' and btrim(coalesce(data->>'plushName',''))<>''
      and coalesce(data->>'productType','') not in ('plush_charm','snowy_charm')
      and concat(data->>'product',' ',data->>'remark') !~* '\m(plush\s*charms?)\M'
    on conflict(order_id) do update set revision=public.certificate_sync_jobs.revision+1,next_attempt_at=now(),last_error=null,attempts=0 returning order_id
  ) select count(*)::integer from queued;
$$;
revoke all on function public.claim_certificate_sync(uuid), public.finish_certificate_sync(text,uuid,integer,text,integer),
  public.read_certificate_sync_link(text,text),public.read_certificate_sync_status(text),public.requeue_tiktok_certificates(text[]) from public,anon,authenticated;
grant execute on function public.claim_certificate_sync(uuid), public.finish_certificate_sync(text,uuid,integer,text,integer),
  public.read_certificate_sync_link(text,text),public.read_certificate_sync_status(text),public.requeue_tiktok_certificates(text[]) to service_role;
