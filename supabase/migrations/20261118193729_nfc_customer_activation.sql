create table public.nfc_activation_sessions (
  token_hash text primary key,
  card_id bigint not null references public.nfc_cards(id),
  phone_key text not null,
  expires_at timestamptz not null default now() + interval '20 minutes',
  submitted_order text,
  payload_hash text,
  created_at timestamptz not null default now()
);
create table public.nfc_customer_activations (
  card_id bigint primary key references public.nfc_cards(id),
  order_id text not null unique references public.fulfilment_orders(id),
  session_hash text not null references public.nfc_activation_sessions(token_hash),
  created_at timestamptz not null default now()
);
create table public.nfc_activation_limits (
  key text primary key,
  started_at timestamptz not null default now(),
  attempts integer not null default 1
);
alter table public.nfc_activation_sessions enable row level security;
alter table public.nfc_customer_activations enable row level security;
alter table public.nfc_activation_limits enable row level security;
revoke all on public.nfc_activation_sessions, public.nfc_customer_activations, public.nfc_activation_limits from public, anon, authenticated;
grant select, insert, update, delete on public.nfc_activation_sessions, public.nfc_activation_limits to service_role;
grant select, insert, delete on public.nfc_customer_activations to service_role;
create index nfc_activation_session_expiry on public.nfc_activation_sessions(expires_at);
create index nfc_activation_limit_expiry on public.nfc_activation_limits(started_at);

create function internal.nfc_customer_phone(p_phone text) returns text
language plpgsql immutable security invoker set search_path='' as $$
declare digits text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
begin
  if left(digits,2)='00' then digits := substring(digits from 3);
  elsif left(digits,1)='0' then digits := '6'||digits;
  elsif left(digits,1)='1' and length(digits) in (9,10) then digits := '60'||digits;
  end if;
  if length(digits) not between 8 and 15 then return ''; end if;
  return digits;
end;
$$;

create function internal.nfc_customer_order_eligible(p_data jsonb, p_status text) returns boolean
language sql immutable security invoker set search_path='' as $$
  select p_status in ('awaiting_customisation','new_order','uploading_audio','sent_for_sewing','packed','shipped')
    and coalesce(p_data->>'productType','') not in ('plush_charm','snowy_charm','custom_tee')
    and concat_ws(' ',p_data->>'product',p_data->>'remark') !~* '\m(plush\s*charms?|custom\s*tee)\M';
$$;

create function public.verify_customer_nfc_phone(p_token text, p_phone text, p_session_hash text, p_client_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.nfc_cards; phone text; candidates jsonb; bucket text; attempts integer;
begin
  if coalesce(p_token,'') !~ '^[a-f0-9]{32}$' or coalesce(p_session_hash,'') !~ '^[a-f0-9]{64}$' or coalesce(p_client_hash,'') !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('verified',false);
  end if;
  -- Both counters commit on unsuccessful verification, so retries cannot evade limits.
  foreach bucket in array array['client:'||p_client_hash, 'card:'||p_token] loop
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
  phone := internal.nfc_customer_phone(p_phone);
  if phone='' then return jsonb_build_object('verified',false); end if;
  select jsonb_agg(jsonb_build_object('id',o.id,'orderNumber',o.data->>'orderNumber',
    'character',coalesce(nullif(o.data->>'character',''),o.data->>'product',''),'plushName',coalesce(o.data->>'plushName','')) order by o.order_date desc, o.id)
    into candidates from public.fulfilment_orders o
    where internal.nfc_customer_phone(o.data->>'phone')=phone
      and internal.nfc_customer_order_eligible(o.data,o.status)
      and not exists(select 1 from public.nfc_cards x where x.order_id=o.id and x.status='assigned')
      and not exists(select 1 from public.nfc_customer_activations a where a.order_id=o.id);
  if candidates is null then return jsonb_build_object('verified',false); end if;
  insert into public.nfc_activation_sessions(token_hash,card_id,phone_key) values(p_session_hash,c.id,phone);
  return jsonb_build_object('verified',true,'orders',candidates);
end;
$$;

create function public.submit_customer_nfc_activation(p_token text, p_session_hash text, p_order text, p_fields jsonb) returns text
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
  if not found or internal.nfc_customer_phone(o.data->>'phone') is distinct from s.phone_key
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
    values(c.id,o.id,'paired','Customer activation','Order phone verified; customer submitted plushie details');
  update public.nfc_activation_sessions set submitted_order=o.id,payload_hash=md5(p_fields::text) where token_hash=s.token_hash;
  return o.id;
end;
$$;

create function public.customer_nfc_activation_state(p_token text) returns text
language sql stable security invoker set search_path='' as $$
  select coalesce((select case
    when c.status='available' and c.programmed_at is not null and a.card_id is null then 'customise'
    when c.status='assigned' and a.order_id=c.order_id and j.revision>j.synced_revision then 'processing'
    when c.status='assigned' then 'assigned' else 'inactive' end
    from public.nfc_cards c left join public.nfc_customer_activations a on a.card_id=c.id
    left join public.certificate_sync_jobs j on j.order_id=c.order_id where c.public_token=p_token),'inactive');
$$;
revoke all on function internal.nfc_customer_phone(text),internal.nfc_customer_order_eligible(jsonb,text),
  public.verify_customer_nfc_phone(text,text,text,text),public.submit_customer_nfc_activation(text,text,text,jsonb),
  public.customer_nfc_activation_state(text) from public,anon,authenticated;
grant execute on function internal.nfc_customer_phone(text),internal.nfc_customer_order_eligible(jsonb,text),
  public.verify_customer_nfc_phone(text,text,text,text),public.submit_customer_nfc_activation(text,text,text,jsonb),
  public.customer_nfc_activation_state(text) to service_role;

create function internal.clear_customer_nfc_activation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.status='assigned' and (new.status<>'assigned' or new.order_id is distinct from old.order_id) then
    delete from public.nfc_customer_activations where card_id=old.id;
  end if;
  return new;
end;
$$;
revoke all on function internal.clear_customer_nfc_activation() from public,anon,authenticated;
grant execute on function internal.clear_customer_nfc_activation() to service_role;
create trigger clear_customer_nfc_activation after update of status,order_id on public.nfc_cards
for each row execute function internal.clear_customer_nfc_activation();
