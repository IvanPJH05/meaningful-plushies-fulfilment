begin;
set local role service_role;
do $$
declare rid text := 'certificate-sync-test-' || gen_random_uuid()::text; rev integer; lease uuid := gen_random_uuid(); jobs jsonb;
begin
  insert into public.fulfilment_orders(id,order_number,order_date,data) values(rid,'CERTIFICATE-TEST',now(), jsonb_build_object('id',rid,'certificateCode','TEST-NO-SHOPIFY-WRITE','plushName','First'));
  select revision into rev from public.certificate_sync_jobs where order_id = rid;
  assert rev = 1, 'Creation must queue once';
  update public.fulfilment_orders set data = data || '{"trackingNumber":"QA"}' where id = rid;
  select revision into rev from public.certificate_sync_jobs where order_id = rid;
  assert rev = 1, 'Unrelated fields must not queue';
  update public.certificate_sync_jobs set lease_token = gen_random_uuid(), lease_until = now() + interval '5 minutes' where order_id = rid;
  update public.fulfilment_orders set data = data || '{"plushName":"Latest","plushBirthPlace":""}' where id = rid;
  select revision into rev from public.certificate_sync_jobs where order_id = rid;
  assert rev = 2, 'Certificate edits must queue the latest revision';
  assert exists(select 1 from public.certificate_sync_jobs where order_id=rid and lease_until>now()), 'Edit must not steal an active worker lease';
  update public.certificate_sync_jobs set synced_revision=1, lease_token=null, lease_until=null where order_id=rid;
  assert exists(select 1 from public.certificate_sync_jobs where order_id=rid and revision>synced_revision), 'Old acknowledgement must not clear newer edits';
  update public.fulfilment_orders set data = data || '{"plushName":"Latest"}' where id = rid;
  select revision into rev from public.certificate_sync_jobs where order_id = rid;
  assert rev = 2, 'Same value must not queue';
  insert into public.fulfilment_orders(id,order_number,order_date,data) values(rid || '-unlinked','CERTIFICATE-TEST',now(), jsonb_build_object('id',rid || '-unlinked','plushName','No certificate'));
  assert not exists(select 1 from public.certificate_sync_jobs where order_id=rid || '-unlinked'), 'Unlinked order must not create a certificate';
  insert into public.fulfilment_orders(id,order_number,order_date,data) values(rid || '-shell','TT-TEST',now(),jsonb_build_object('salesChannel','tiktok','certificateCode','TEST-SHELL','plushName',''));
  assert not exists(select 1 from public.certificate_sync_jobs where order_id=rid || '-shell'), 'TikTok shell must wait for customisation';
  update public.fulfilment_orders set data=data || '{"plushName":"QA","meaningfulMessage":"Gender: Female"}' where id=rid || '-shell';
  assert exists(select 1 from public.certificate_sync_jobs where order_id=rid || '-shell'), 'TikTok details must queue automatic creation';
  insert into public.fulfilment_orders(id,order_number,order_date,data) values(rid || '-charm','TT-CHARM',now(),jsonb_build_object('salesChannel','tiktok','certificateCode','LEGACY-CHARM','plushName','QA','product','Meaningful Plush Charms'));
  assert not exists(select 1 from public.certificate_sync_jobs where order_id=rid || '-charm'), 'Plush Charm must never queue a certificate';
  jobs := public.claim_certificate_sync(lease);
  assert jsonb_array_length(jobs)<=3, 'Claims must be bounded';
  assert not exists(select 1 from jsonb_array_elements(jobs) j where j->'data' ? 'photoDataUrl' or j->'data' ? 'tikTokFileDataUrl'), 'Worker must not load inline media';
  perform public.finish_certificate_sync(rid,gen_random_uuid(),2,null,30);
  assert exists(select 1 from public.certificate_sync_jobs where order_id=rid and synced_revision=1), 'Wrong lease must not acknowledge';
  if exists(select 1 from jsonb_array_elements(jobs) j where j->>'order_id'=rid) then
    perform public.finish_certificate_sync(rid,lease,1,null,30);
    assert exists(select 1 from public.certificate_sync_jobs where order_id=rid and revision>synced_revision and lease_token is null), 'RPC old acknowledgement must preserve newer work';
  end if;
end $$;
-- Exercise the deployed warehouse role and a real active administrator session
-- against a disposable order; all changes, including audit rows, roll back.
set local role service_role;
do $$
declare rid text:='certificate-edit-test-'||gen_random_uuid(); token uuid; stamp timestamptz:=now(); saved jsonb;
begin
  select s.token into token from public.dashboard_sessions s join public.dashboard_accounts a on a.id=s.account_id
    where s.expires_at>now() and a.active and a.role='admin' limit 1;
  assert token is not null, 'Integration test requires an existing active admin session';
  insert into public.fulfilment_orders(id,order_number,order_date,updated_at,data)
    values(rid,'CERTIFICATE-EDIT-TEST',stamp,stamp,jsonb_build_object('id',rid,'orderNumber','CERTIFICATE-EDIT-TEST','certificateCode','TEST-EDIT','plushName','Old','meaningfulNote','Keep this','photoDataUrl','data:image/png;base64,AA=='));
  saved:=public.edit_fulfilment_order(rid,stamp,jsonb_build_object('plushName','New "name"','plushGender','Female'),token);
  assert saved->>'plushName'='New "name"', 'Quotes must survive saving';
  assert saved->>'meaningfulNote'='Keep this', 'Unrelated fields must survive';
  assert public.read_certificate_sync_status(rid)->>'status'='pending', 'Service role must read sync status';
  assert jsonb_array_length(public.read_certificate_sync_link(rid,'TEST-EDIT')->'sessions')=0, 'Service role must read certificate links';
  assert not saved ? 'photoDataUrl', 'Save response must omit inline photos';
  assert exists(select 1 from public.certificate_sync_jobs where order_id=rid and revision=2), 'Saving must atomically queue the certificate';
  begin
    perform public.edit_fulfilment_order(rid,stamp,'{"plushName":"Stale"}',token);
    raise exception 'Stale edit was accepted';
  exception when raise_exception then
    if sqlerrm<>'ORDER_CHANGED' then raise; end if;
  end;
  begin
    perform public.edit_fulfilment_order(rid,(saved->>'updatedAt')::timestamptz,'{"certificateCode":"Other"}',token);
    raise exception 'Certificate relinking was accepted';
  exception when raise_exception then
    if sqlerrm<>'INVALID_ORDER_EDIT' then raise; end if;
  end;
  begin
    perform public.edit_fulfilment_order(rid,(saved->>'updatedAt')::timestamptz,'{"plushName":"Unauthorized"}',gen_random_uuid());
    raise exception 'Unauthorized edit was accepted';
  exception when raise_exception then
    if sqlerrm<>'LOGIN_REQUIRED' then raise; end if;
  end;
end $$;
rollback;
