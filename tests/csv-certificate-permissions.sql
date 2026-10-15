-- Regression test against the production schema. Always rolls back fixtures.
begin;
set local role service_role;
insert into public.fulfilment_orders(id,order_number,status,order_date,updated_at,data)
values ('__csv_service_fixture__','TTTEST 1234','new_order',now(),now(),
  jsonb_build_object('id','__csv_service_fixture__','salesChannel','tiktok',
    'certificateCode','test1234','plushName','Sam "Junior"','product','Billy'));
do $$ begin
  if not exists (select 1 from public.certificate_sync_jobs
    where order_id='__csv_service_fixture__' and revision=1)
  then raise exception 'Complete import was not queued'; end if;
end $$;
update public.fulfilment_orders set data=data || '{"trackingNumber":"test"}'::jsonb
where id='__csv_service_fixture__';
do $$ begin
  if not exists (select 1 from public.certificate_sync_jobs
    where order_id='__csv_service_fixture__' and revision=1)
  then raise exception 'Tracking update requeued unnecessarily'; end if;
end $$;
update public.fulfilment_orders set data=data || jsonb_build_object('plushName','Updated "Name"')
where id='__csv_service_fixture__';
do $$ begin
  if not exists (select 1 from public.certificate_sync_jobs
    where order_id='__csv_service_fixture__' and revision=2)
  then raise exception 'Customisation update was not requeued'; end if;
end $$;
reset role;
do $$ begin
  if has_table_privilege('anon','public.certificate_sync_jobs','SELECT')
    or has_table_privilege('anon','public.certificate_sync_jobs','INSERT')
    or has_table_privilege('authenticated','public.certificate_sync_jobs','INSERT')
    or has_function_privilege('anon','public.claim_certificate_sync(uuid)','EXECUTE')
  then raise exception 'Private queue must remain inaccessible to browsers'; end if;
end $$;
rollback;
