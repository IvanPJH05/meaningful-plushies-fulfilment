alter table public.nfc_activation_sessions
  add column verification_method text not null default 'phone' check (verification_method in ('phone','tiktok')),
  add column verified_order_id text;
alter table public.nfc_activation_sessions add constraint nfc_activation_verified_order
  check ((verification_method='phone' and verified_order_id is null)
    or (verification_method='tiktok' and verified_order_id is not null and verified_order_id ~ '^[0-9]{8,32}$'));

create function internal.nfc_customer_tiktok_order_id(p_id text, p_data jsonb) returns text
language sql immutable security invoker set search_path='' as $$
  select case when p_data->>'salesChannel'='tiktok' then coalesce(
    substring(p_id from '^tiktok-([0-9]{8,32})(?:-|$)'),
    substring(p_data->>'orderNumber' from '(?:^|\s)TT[0-9]+\s+([0-9]{8,32})(?:-|\s|$)'),
    case when p_data->>'orderNumber' ~ '^[0-9]{8,32}$' then p_data->>'orderNumber' end
  ) end;
$$;

create function internal.nfc_customer_session_matches(p_session public.nfc_activation_sessions, p_order public.fulfilment_orders) returns boolean
language sql immutable security invoker set search_path='' as $$
  select case when p_session.verification_method='tiktok' then
    internal.nfc_customer_tiktok_order_id(p_order.id,p_order.data)=p_session.verified_order_id
  else internal.nfc_customer_phone(p_order.data->>'phone')=p_session.phone_key end;
$$;

create function public.verify_customer_nfc_tiktok(p_token text, p_digits text, p_session_hash text, p_client_hash text, p_full_order_id text default '') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.nfc_cards; bucket text; attempts integer; matches text[]; parent_id text; candidates jsonb;
begin
  if coalesce(p_token,'') !~ '^[a-f0-9]{32}$' or coalesce(p_session_hash,'') !~ '^[a-f0-9]{64}$'
    or coalesce(p_client_hash,'') !~ '^[a-f0-9]{64}$' or coalesce(p_digits,'') !~ '^[0-9]{6}$' then
    return jsonb_build_object('verified',false);
  end if;
  foreach bucket in array array['client:'||p_client_hash,'card:'||p_token] loop
    insert into public.nfc_activation_limits as l(key) values(bucket)
      on conflict(key) do update set
        attempts=case when l.started_at < now()-interval '15 minutes' then 1 else l.attempts+1 end,
        started_at=case when l.started_at < now()-interval '15 minutes' then now() else l.started_at end
      returning l.attempts into attempts;
    if attempts > (case when bucket like 'card:%' then 10 else 25 end) then
      return jsonb_build_object('verified',false,'limited',true);
    end if;
  end loop;
  delete from public.nfc_activation_sessions where expires_at < now()-interval '1 day'
    and not exists(select 1 from public.nfc_customer_activations a where a.session_hash=token_hash);
  delete from public.nfc_activation_limits where started_at < now()-interval '1 day';
  select * into c from public.nfc_cards where public_token=p_token for update;
  if not found or c.status<>'available' or c.programmed_at is null
    or exists(select 1 from public.nfc_customer_activations where card_id=c.id) then
    return jsonb_build_object('verified',false);
  end if;
  if coalesce(p_full_order_id,'')<>'' then
    if p_full_order_id !~ '^[0-9]{8,32}$' or right(p_full_order_id,6)<>p_digits then
      return jsonb_build_object('verified',false);
    end if;
    parent_id := p_full_order_id;
  else
    select array_agg(distinct internal.nfc_customer_tiktok_order_id(o.id,o.data)) into matches
      from public.fulfilment_orders o
      where right(internal.nfc_customer_tiktok_order_id(o.id,o.data),6)=p_digits;
    if coalesce(array_length(matches,1),0)=0 then return jsonb_build_object('verified',false); end if;
    if array_length(matches,1)>1 then return jsonb_build_object('verified',false,'needsFullOrderId',true); end if;
    parent_id := matches[1];
  end if;
  select jsonb_agg(jsonb_build_object('id',o.id,'orderNumber',o.data->>'orderNumber','itemNumber',o.item_number,
    'character',coalesce(nullif(o.data->>'character',''),o.data->>'product',''),'plushName',coalesce(o.data->>'plushName','')) order by o.id)
    into candidates from (
      select source.*,coalesce(substring(source.data->>'setIndicator' from '^\(([0-9]+),'),row_number() over(order by source.id)::text) as item_number
      from public.fulfilment_orders source where internal.nfc_customer_tiktok_order_id(source.id,source.data)=parent_id
    ) o
    where internal.nfc_customer_order_eligible(o.data,o.status)
      and not exists(select 1 from public.nfc_cards x where x.order_id=o.id and x.status='assigned')
      and not exists(select 1 from public.nfc_customer_activations a where a.order_id=o.id);
  if candidates is null then return jsonb_build_object('verified',false); end if;
  insert into public.nfc_activation_sessions(token_hash,card_id,phone_key,verification_method,verified_order_id)
    values(p_session_hash,c.id,'','tiktok',parent_id);
  return jsonb_build_object('verified',true,'orders',candidates);
end;
$$;
revoke all on function internal.nfc_customer_tiktok_order_id(text,jsonb),
  internal.nfc_customer_session_matches(public.nfc_activation_sessions,public.fulfilment_orders),
  public.verify_customer_nfc_tiktok(text,text,text,text,text) from public,anon,authenticated;
grant execute on function internal.nfc_customer_tiktok_order_id(text,jsonb),
  internal.nfc_customer_session_matches(public.nfc_activation_sessions,public.fulfilment_orders),
  public.verify_customer_nfc_tiktok(text,text,text,text,text) to service_role;

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
  if c.status<>'available' or c.programmed_at is null
    or exists(select 1 from public.nfc_customer_activations where card_id=c.id) then raise exception 'NFC_ACTIVATION_CHANGED'; end if;
  select * into o from public.fulfilment_orders where id=p_order for update;
  if not found or not coalesce(internal.nfc_customer_session_matches(s,o),false)
    or not internal.nfc_customer_order_eligible(o.data,o.status) then raise exception 'NFC_ACTIVATION_ORDER'; end if;
  if exists(select 1 from public.nfc_cards where order_id=o.id and status='assigned')
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
  update public.nfc_cards set status='assigned',order_id=o.id,paired_at=now(),paired_by='Customer activation' where id=c.id;
  insert into public.nfc_customer_activations(card_id,order_id,session_hash) values(c.id,o.id,s.token_hash);
  insert into public.nfc_pairing_logs(card_id,order_id,action,actor,reason)
    values(c.id,o.id,'paired','Customer activation',case when s.verification_method='tiktok' then 'TikTok order verified; customer submitted plushie details' else 'Order phone verified; customer submitted plushie details' end);
  update public.nfc_activation_sessions set submitted_order=o.id,payload_hash=md5(p_fields::text) where token_hash=s.token_hash;
  return o.id;
end;
$$;
