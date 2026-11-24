-- The submitted session is the certificate authority for its individual
-- fulfilment row. Enforce this at write time, including stale browser saves
-- and overlapping webhook/manual-collection requests.
-- This private trigger needs to read sessions hidden by RLS from dashboard
-- writers. It exposes no RPC and changes only the row already being written;
-- normal fulfilment_orders RLS still authorizes that write.
create or replace function internal.preserve_submitted_certificate_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  linked public.customisation_sessions%rowtype;
  matches integer;
begin
  if new.data->>'productType' in ('plush_charm','snowy_charm')
    or concat(new.data->>'product',' ',new.data->>'remark') ~* '\m(plush\s*charms?)\M'
  then return new; end if;

  select count(*) into matches from public.customisation_sessions s
  where s.fulfilment_order_id=new.id and s.status='submitted'
    and nullif(s.certificate_code,'') is not null and s.certificate_metaobject_id is not null;
  if matches=0 then return new; end if;
  if matches<>1 then raise exception 'CERTIFICATE_SESSION_AMBIGUOUS'; end if;
  select * into linked from public.customisation_sessions s
  where s.fulfilment_order_id=new.id and s.status='submitted'
    and nullif(s.certificate_code,'') is not null and s.certificate_metaobject_id is not null;

  if nullif(linked.order_number,'') is not null
    and regexp_replace(linked.order_number,'^#','')<>regexp_replace(coalesce(new.data->>'orderNumber',''),'^#','')
  then raise exception 'CERTIFICATE_SESSION_ORDER_MISMATCH'; end if;
  if nullif(linked.line_item_id,'') is not null and nullif(new.data->>'shopifyLineItemId','') is not null
    and regexp_replace(linked.line_item_id,'^gid://shopify/LineItem/','')<>regexp_replace(new.data->>'shopifyLineItemId','^gid://shopify/LineItem/','')
  then raise exception 'CERTIFICATE_SESSION_ITEM_MISMATCH'; end if;

  new.data:=new.data||jsonb_build_object(
    'certificateCode',linked.certificate_code,
    'idWebsiteLink','https://meaningfulplushies.com/pages/certificate/'||linked.certificate_code,
    'customisationSessionId',linked.id::text);
  return new;
end $$;
revoke all on function internal.preserve_submitted_certificate_identity() from public,anon,authenticated;
create trigger zz_preserve_submitted_certificate_identity
before insert or update of data on public.fulfilment_orders
for each row execute function internal.preserve_submitted_certificate_identity();
