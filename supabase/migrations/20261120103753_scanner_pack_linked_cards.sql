-- Scanning at the packing station is staff confirmation that the parcel is ready.
-- Customer activation stays bound to the exact item assigned by staff.
alter table public.nfc_cards add column customisation_pending boolean not null default false;
alter table public.nfc_activation_sessions drop constraint nfc_activation_sessions_verification_method_check;
alter table public.nfc_activation_sessions drop constraint nfc_activation_verified_order;
alter table public.nfc_activation_sessions add constraint nfc_activation_sessions_verification_method_check
  check(verification_method in ('phone','tiktok','paired'));
alter table public.nfc_activation_sessions add constraint nfc_activation_verified_order check(
  (verification_method='phone' and verified_order_id is null)
  or (verification_method='tiktok' and verified_order_id is not null and verified_order_id ~ '^[0-9]{8,32}$')
  or (verification_method='paired' and verified_order_id is not null and length(verified_order_id) between 1 and 200));

create or replace function internal.nfc_customer_session_matches(p_session public.nfc_activation_sessions,p_order public.fulfilment_orders) returns boolean
language sql immutable security invoker set search_path='' as $$
  select case when p_session.verification_method='paired' then p_session.verified_order_id=p_order.id
    when p_session.verification_method='tiktok' then internal.nfc_customer_tiktok_order_id(p_order.id,p_order.data)=p_session.verified_order_id
    else internal.nfc_customer_phone(p_order.data->>'phone')=p_session.phone_key end;
$$;

create or replace function public.customer_nfc_activation_state(p_token text) returns text
language sql stable security invoker set search_path='' as $$
  select coalesce((select case
    when c.status='assigned' and c.customisation_pending then 'linked_customise'
    when c.status='available' and c.programmed_at is not null and a.card_id is null then 'customise'
    when c.status='assigned' and a.order_id=c.order_id and j.revision>j.synced_revision then 'processing'
    when c.status='assigned' then 'assigned' else 'inactive' end
    from public.nfc_cards c left join public.nfc_customer_activations a on a.card_id=c.id
    left join public.certificate_sync_jobs j on j.order_id=c.order_id where c.public_token=p_token),'inactive');
$$;

-- Possession of the unguessable card link authorises only its already-paired item.
-- Return plushie fields only; never expose the customer's phone/address.
create function public.start_linked_nfc_customisation(p_token text,p_session_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.nfc_cards; o public.fulfilment_orders; attempts integer;
begin
  if coalesce(p_token,'') !~ '^[a-f0-9]{32}$' or coalesce(p_session_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'NFC_ACTIVATION_EXPIRED'; end if;
  insert into public.nfc_activation_limits as l(key) values('linked:'||p_token)
    on conflict(key) do update set attempts=case when l.started_at<now()-interval '15 minutes' then 1 else l.attempts+1 end,
      started_at=case when l.started_at<now()-interval '15 minutes' then now() else l.started_at end returning l.attempts into attempts;
  if attempts>20 then return jsonb_build_object('verified',false,'limited',true); end if;
  select * into c from public.nfc_cards where public_token=p_token for update;
  if not found or c.status<>'assigned' or not c.customisation_pending or c.programmed_at is null then raise exception 'NFC_ACTIVATION_CHANGED'; end if;
  select * into o from public.fulfilment_orders where id=c.order_id;
  if not found or not internal.nfc_customer_order_eligible(o.data,o.status) then raise exception 'NFC_ACTIVATION_ORDER'; end if;
  delete from public.nfc_activation_sessions where card_id=c.id and verification_method='paired' and submitted_order is null and expires_at<now();
  insert into public.nfc_activation_sessions(token_hash,card_id,phone_key,verification_method,verified_order_id)
    values(p_session_hash,c.id,'','paired',o.id);
  return jsonb_build_object('verified',true,'orders',jsonb_build_array(jsonb_build_object(
    'id',o.id,'character',coalesce(o.data->>'character',''),'plushName',coalesce(o.data->>'plushName',''))));
end;
$$;
revoke all on function public.start_linked_nfc_customisation(text,text) from public,anon,authenticated;
grant execute on function public.start_linked_nfc_customisation(text,text) to service_role;

create or replace function public.mutate_nfc_card(p_action text,p_card bigint,p_order text,p_actor text,p_reason text default '') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.nfc_cards; o public.fulfilment_orders; target text; prior text; charm boolean; pending boolean;
begin
  if p_action is null or p_action not in ('programmed','pair','unpair','void') or btrim(coalesce(p_actor,''))='' then raise exception 'INVALID_NFC_ACTION'; end if;
  -- All actions lock a card before its order. The per-order unique index also
  -- protects two simultaneous scans of different cards for the same plushie.
  select * into c from public.nfc_cards where id=p_card for update;
  if not found then raise exception 'NFC_CARD_NOT_FOUND'; end if;
  prior := c.order_id;
  if p_action='programmed' then
    if c.status='voided' then raise exception 'NFC_CARD_VOIDED'; end if;
    if c.programmed_at is not null then return to_jsonb(c); end if;
    update public.nfc_cards set programmed_at=now(),programmed_by=p_actor where id=c.id;
  elsif p_action='pair' then
    if c.status='voided' then raise exception 'NFC_CARD_VOIDED'; end if;
    if c.status='assigned' then
      if c.order_id=p_order then return to_jsonb(c); end if;
      raise exception 'NFC_CARD_ALREADY_ASSIGNED';
    end if;
    if c.programmed_at is null then raise exception 'NFC_CARD_NOT_PROGRAMMED'; end if;
    select * into o from public.fulfilment_orders where id=p_order for update;
    if not found then raise exception 'NFC_ORDER_NOT_FOUND'; end if;
    if o.status not in ('awaiting_customisation','new_order','uploading_audio','sent_for_sewing','packed') then raise exception 'NFC_ORDER_NOT_READY'; end if;
    charm := coalesce(o.data->>'productType','') in ('plush_charm','snowy_charm') or concat_ws(' ',o.data->>'product',o.data->>'remark') ~* '\mplush\s*charms?\M';
    pending := not charm and (btrim(coalesce(o.data->>'plushName',''))='' or btrim(coalesce(o.data->>'character',''))='');
    if pending and not internal.nfc_customer_order_eligible(o.data,o.status) then raise exception 'NFC_ORDER_NOT_READY'; end if;
    if not pending then
      target := internal.nfc_destination(o.data);
      if target is null then raise exception 'NFC_CERTIFICATE_MISSING'; end if;
      if exists(select 1 from public.certificate_sync_jobs where order_id=o.id and revision>synced_revision) then raise exception 'NFC_CERTIFICATE_PENDING'; end if;
      if exists(select 1 from public.fulfilment_orders where id<>o.id and internal.nfc_destination(data)=target) then raise exception 'NFC_CERTIFICATE_SHARED'; end if;
    end if;
    if exists(select 1 from public.nfc_cards where order_id=o.id and status='assigned') then raise exception 'NFC_ORDER_ALREADY_PAIRED'; end if;
    update public.nfc_cards set status='assigned',order_id=o.id,paired_at=now(),paired_by=p_actor,customisation_pending=pending where id=c.id;
    prior := o.id;
  else
    if btrim(coalesce(p_reason,''))='' or length(p_reason)>500 then raise exception 'NFC_REASON_REQUIRED'; end if;
    if c.order_id is distinct from nullif(p_order,'') then raise exception 'NFC_CARD_CHANGED'; end if;
    if p_action='unpair' then
      if c.status<>'assigned' then raise exception 'NFC_CARD_NOT_ASSIGNED'; end if;
      update public.nfc_cards set status='available',order_id=null,paired_at=null,paired_by=null,customisation_pending=false where id=c.id;
    else
      if c.status='voided' then return to_jsonb(c); end if;
      update public.nfc_cards set status='voided',customisation_pending=false where id=c.id;
    end if;
  end if;
  insert into public.nfc_pairing_logs(card_id,order_id,action,actor,reason)
    values(c.id,prior,case p_action when 'pair' then 'paired' when 'unpair' then 'unpaired' when 'void' then 'voided' else 'programmed' end,p_actor,coalesce(p_reason,''));
  return (select to_jsonb(x) from public.nfc_cards x where id=c.id);
end;
$$;

create or replace function public.submit_customer_nfc_activation(p_token text, p_session_hash text, p_order text, p_fields jsonb) returns text
language plpgsql security invoker set search_path='' as $$
declare s public.nfc_activation_sessions; c public.nfc_cards; o public.fulfilment_orders;
  fields jsonb; code text; sessions integer; character text; existing_character text;
begin
  select * into s from public.nfc_activation_sessions where token_hash=p_session_hash for update;
  if not found then raise exception 'NFC_ACTIVATION_EXPIRED'; end if;
  select * into c from public.nfc_cards where id=s.card_id for update;
  if c.public_token is distinct from p_token then raise exception 'NFC_ACTIVATION_EXPIRED'; end if;
  if s.submitted_order is not null then
    if s.submitted_order=p_order and s.payload_hash=md5(p_fields::text)
      and c.status='assigned' and c.order_id=p_order then return p_order; end if;
    raise exception 'NFC_ACTIVATION_CHANGED';
  end if;
  if s.expires_at < now() then raise exception 'NFC_ACTIVATION_EXPIRED'; end if;
  if not ((c.status='available' and s.verification_method in ('phone','tiktok')) or (c.status='assigned' and c.customisation_pending and s.verification_method='paired' and c.order_id=p_order)) or c.programmed_at is null
    or exists(select 1 from public.nfc_customer_activations where card_id=c.id) then raise exception 'NFC_ACTIVATION_CHANGED'; end if;
  select * into o from public.fulfilment_orders where id=p_order for update;
  if not found or not coalesce(internal.nfc_customer_session_matches(s,o),false)
    or not internal.nfc_customer_order_eligible(o.data,o.status) then raise exception 'NFC_ACTIVATION_ORDER'; end if;
  if exists(select 1 from public.nfc_cards where order_id=o.id and status='assigned' and id<>c.id)
    or exists(select 1 from public.nfc_customer_activations where order_id=o.id) then raise exception 'NFC_ACTIVATION_CHANGED'; end if;
  if jsonb_typeof(p_fields)<>'object' or length(btrim(coalesce(p_fields->>'plushName',''))) not between 1 and 100
    or length(coalesce(p_fields->>'meaningfulNote',''))>4000 then raise exception 'NFC_ACTIVATION_FIELDS'; end if;
  character := p_fields->>'character';
  if character is null or character not in ('Billy','Tootsie','Hunnie','Dragon Warrior') then raise exception 'NFC_ACTIVATION_FIELDS'; end if;
  existing_character := case
    when concat_ws(' ',o.data->>'character',o.data->>'product') ~* 'tootsie' then 'Tootsie'
    when concat_ws(' ',o.data->>'character',o.data->>'product') ~* 'hunn?ie|hunny' then 'Hunnie'
    when concat_ws(' ',o.data->>'character',o.data->>'product') ~* 'dragon' then 'Dragon Warrior'
    when concat_ws(' ',o.data->>'character',o.data->>'product') ~* 'billy' then 'Billy' end;
  if existing_character is not null and existing_character<>character then raise exception 'NFC_ACTIVATION_FIELDS'; end if;
  select count(*) into sessions from public.customisation_sessions where fulfilment_order_id=o.id;
  if sessions>1 then raise exception 'NFC_ACTIVATION_CERTIFICATE'; end if;
  code := coalesce(nullif(btrim(o.data->>'certificateCode'),''),
    (select nullif(certificate_code,'') from public.customisation_sessions where fulfilment_order_id=o.id), 'nfc-'||c.id);
  if exists(select 1 from public.customisation_sessions where fulfilment_order_id=o.id
    and nullif(certificate_code,'') is not null and certificate_code<>code) then raise exception 'NFC_ACTIVATION_CERTIFICATE'; end if;
  if code !~ '^[A-Za-z0-9_-]+$' or exists(select 1 from public.fulfilment_orders where id<>o.id and data->>'certificateCode'=code) then
    raise exception 'NFC_ACTIVATION_CERTIFICATE'; end if;
  fields := jsonb_build_object('plushName',btrim(p_fields->>'plushName'),'character',character,
    'plushGender',left(btrim(coalesce(p_fields->>'plushGender','')),40),
    'plushBirthDate',left(btrim(coalesce(p_fields->>'plushBirthDate','')),30),
    'plushBirthPlace',left(btrim(coalesce(p_fields->>'plushBirthPlace','')),150),
    'plushFavouritePerson',left(btrim(coalesce(p_fields->>'plushFavouritePerson','')),150),
    'plushBelongsTo',left(btrim(coalesce(p_fields->>'plushBelongsTo','')),150),
    'meaningfulNote',btrim(coalesce(p_fields->>'meaningfulNote','')),'certificateCode',code,
    'idWebsiteLink','https://meaningfulplushies.com/pages/certificate/'||code,'updatedAt',now());
  update public.fulfilment_orders set data=data||fields,updated_at=now() where id=o.id;
  -- A durable queue also covers retries after the HTTP response is interrupted.
  insert into public.certificate_sync_jobs(order_id) values(o.id)
    on conflict(order_id) do update set revision=public.certificate_sync_jobs.revision+1,
      next_attempt_at=now(),attempts=0,last_error=null;
  update public.nfc_cards set status='assigned',order_id=o.id,paired_at=now(),paired_by=coalesce(c.paired_by,'Customer activation'),customisation_pending=false where id=c.id;
  insert into public.nfc_customer_activations(card_id,order_id,session_hash) values(c.id,o.id,s.token_hash);
  insert into public.nfc_pairing_logs(card_id,order_id,action,actor,reason)
    values(c.id,o.id,'paired','Customer activation',case when s.verification_method='paired' then 'Staff-linked card; customer submitted plushie details' when s.verification_method='tiktok' then 'TikTok order verified; customer submitted plushie details' else 'Order phone verified; customer submitted plushie details' end);
  update public.nfc_activation_sessions set submitted_order=o.id,payload_hash=md5(p_fields::text) where token_hash=s.token_hash;
  return o.id;
end;
$$;

create function internal.production_scan_matches(o public.fulfilment_orders,p_barcode text) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare scan text:=upper(btrim(coalesce(p_barcode,''))); number text:=upper(regexp_replace(o.order_number,'^#',''));
begin
  if scan like 'MPI-%' then return substring(scan from 5)=upper(o.id); end if;
  if o.id ~ '^[0-9]+-[0-9]+$' and position(upper(o.id) in scan)=0 then return false; end if;
  scan:=regexp_replace(regexp_replace(scan,'^MP-?',''),'^#','');
  return scan<>'' and (scan=upper(o.id) or scan=number or (scan ~ '^TT[0-9]+$' and left(number,length(scan)+1)=scan||' '));
end;
$$;

create or replace function internal.require_nfc_pairing_at_packing() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.status in ('packed','shipped') and new.status is distinct from old.status
    and exists(select 1 from public.nfc_pairing_requirements where order_id=new.id)
    and not exists(select 1 from public.nfc_cards where order_id=new.id and status='assigned')
    and not (current_user='service_role' and coalesce(current_setting('app.production_scanner_order',true),'')=new.id) then
    raise exception 'Pair this plushie with its NFC card before marking it packed or shipped.';
  end if;
  return new;
end;
$$;

create function public.production_scanner_pack(p_actor uuid,p_order text,p_barcode text) returns void
language plpgsql security invoker set search_path='' as $$
declare o public.fulfilment_orders; v public.production_items; batch uuid; actor text; previous_context text;
begin
  perform public.bc_v2_require_staff(p_actor);
  -- Match the production workflow's batch -> item -> order lock order.
  select batch_id into batch from public.production_items where order_id=p_order;
  perform 1 from public.production_batches where id=batch for update;
  select * into v from public.production_items where order_id=p_order for update;
  select * into o from public.fulfilment_orders where id=p_order for update;
  if not found or not internal.production_scan_matches(o,p_barcode) then raise exception 'Scan this order barcode.'; end if;
  select display_name into actor from public.dashboard_accounts where id=p_actor;
  if v.id is not null and (v.stage<>'packed' or v.issue<>'' or v.disposition<>'active' or v.carried_issue<>'') then
    if v.issue<>'' or v.disposition<>'active' or v.carried_issue<>'' then
      insert into public.production_events(item_id,stage,kind,note,actor) values(v.id,v.stage,'resolved',
        'Packing station scan confirms manually resolved: '||concat_ws(' / ',nullif(v.issue,''),nullif(v.carried_issue,''),v.disposition),p_actor);
    end if;
    update public.production_items set stage='packed',issue='',carried_issue='',disposition='active',deferred_until=null,version=version+1,updated_at=now() where id=v.id;
    insert into public.production_events(item_id,stage,kind,note,actor) values(v.id,'packed','stage','Packed by order barcode scan; previous stage: '||v.stage,p_actor);
  end if;
  previous_context:=coalesce(current_setting('app.production_scanner_order',true),'');
  perform set_config('app.production_scanner_order',o.id,true);
  perform public.transition_fulfilment_orders(jsonb_build_array(jsonb_build_object('orderId',o.id,'fromStatus',o.status,'toStatus','packed',
    'note','Packing station order barcode scanned; staff confirms parcel ready.')),'Daily Production · '||coalesce(actor,'Staff'));
  perform set_config('app.production_scanner_order',previous_context,true);
end;
$$;

create function public.production_scanner_pair(p_actor uuid,p_order text,p_barcode text,p_card text,p_details jsonb default null) returns void
language plpgsql security invoker set search_path='' as $$
declare o public.fulfilment_orders; actor text; batch uuid;
begin
  perform public.bc_v2_require_staff(p_actor);
  select batch_id into batch from public.production_items where order_id=p_order;
  perform 1 from public.production_batches where id=batch for update;
  perform 1 from public.production_items where order_id=p_order for update;
  select * into o from public.fulfilment_orders where id=p_order;
  if not found or not internal.production_scan_matches(o,p_barcode) then raise exception 'Scan this order barcode.'; end if;
  if o.status<>'packed' then raise exception 'Scan the order again before pairing.'; end if;
  select display_name into actor from public.dashboard_accounts where id=p_actor;
  if p_card ~ '^NFC-[0-9]{6,12}$' then
    perform public.mutate_nfc_card('pair',substring(p_card from 5)::bigint,o.id,coalesce(actor,'Daily Production'),'');
  elsif p_card ~ '^[0-9]{6}$' then
    perform public.bc_v3_link(p_actor,p_card,o.id,o.id,o.updated_at,p_details);
  else raise exception 'Scan a valid NFC card barcode.'; end if;
  update public.production_items set certificate_code=p_card,version=version+1,updated_at=now() where order_id=o.id and certificate_code is distinct from p_card;
end;
$$;
revoke all on function internal.production_scan_matches(public.fulfilment_orders,text),public.production_scanner_pack(uuid,text,text),public.production_scanner_pair(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function internal.production_scan_matches(public.fulfilment_orders,text),public.production_scanner_pack(uuid,text,text),public.production_scanner_pair(uuid,text,text,text,jsonb) to service_role;

-- The scan also confirms manual QC for TikTok shells with missing audio.
create or replace function internal.gate_tiktok_customisation() returns trigger
language plpgsql security invoker set search_path='' as $$
declare ready boolean; changed_at timestamptz;
begin
  if new.data->>'salesChannel' is distinct from 'tiktok' then return new; end if;
  if new.status='packed' and current_user='service_role' and coalesce(current_setting('app.production_scanner_order',true),'')=new.id then return new; end if;
  ready := internal.tiktok_customisation_ready(new.data);
  if old.status = 'awaiting_customisation' then
    if new.status not in ('awaiting_customisation','issue') and not ready then
      raise exception 'Save the customer voice before moving this TikTok order to production.';
    end if;
    -- Only completion of missing information promotes an awaiting order.
    -- An unrelated edit or repeated sync must not append another transition.
    if new.status = 'awaiting_customisation' and ready
      and not internal.tiktok_customisation_ready(old.data) then
      changed_at := clock_timestamp();
      new.status := 'new_order';
      new.updated_at := greatest(changed_at,new.updated_at);
      new.data := new.data || jsonb_build_object('status','new_order','updatedAt',new.updated_at,
        'voiceUploadStatus',case when new.data->>'voiceUploadStatus'='checked' then 'checked' else 'received' end,
        'statusHistory',coalesce(new.data->'statusHistory','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
          'id',gen_random_uuid()::text,'status','new_order','changedAt',changed_at,
          'changedBy','Fulfilment','note','Customer voice saved. Ready for production.')));
    end if;
  end if;
  return new;
end;
$$;
