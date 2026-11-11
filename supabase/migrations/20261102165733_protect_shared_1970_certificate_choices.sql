-- The two shipped cards keep their shared URL. Only these fulfilment rows
-- are assigned separate editable certificates behind that landing page.
create or replace function internal.preserve_1970_order_certificate()
returns trigger language plpgsql security invoker set search_path='' as $$
declare choice text;
begin
 choice:=case new.id when '1970-1' then '19701698520-1' when '1970-2' then '19701698520-2' else null end;
 if choice is not null and coalesce(new.data->>'certificateCode','') in ('','19701698520') then
  new.data:=new.data||jsonb_build_object('certificateCode',choice,'idWebsiteLink','https://meaningfulplushies.com/pages/certificate/'||choice);
 end if;
 return new;
end $$;
revoke all on function internal.preserve_1970_order_certificate() from public,anon,authenticated;
create trigger preserve_1970_order_certificate before insert or update of data on public.fulfilment_orders
for each row execute function internal.preserve_1970_order_certificate();

create or replace function internal.preserve_1970_session_certificate()
returns trigger language plpgsql security invoker set search_path='' as $$
declare choice text;
begin
 choice:=case old.fulfilment_order_id when '1970-1' then '19701698520-1' when '1970-2' then '19701698520-2' else null end;
 if choice is not null and old.certificate_code=choice and new.fulfilment_order_id=old.fulfilment_order_id then
  new.certificate_code:=old.certificate_code;
  new.certificate_metaobject_id:=old.certificate_metaobject_id;
 end if;
 return new;
end $$;
revoke all on function internal.preserve_1970_session_certificate() from public,anon,authenticated;
create trigger preserve_1970_session_certificate before update on public.customisation_sessions
for each row execute function internal.preserve_1970_session_certificate();
