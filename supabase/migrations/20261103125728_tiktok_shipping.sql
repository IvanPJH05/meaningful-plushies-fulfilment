-- Only the authenticated server can book shipments or access package documents.
create table public.tiktok_shipping_packages (
  shop_id text not null,
  package_id text not null,
  order_id text not null references public.fulfilment_orders(id),
  booking_state text not null default 'none' check (booking_state in ('none','attempting','arranged','failed','uncertain')),
  label_url text,
  tracking_number text,
  courier text,
  updated_at timestamptz not null default now(),
  primary key (shop_id,package_id)
);
alter table public.tiktok_shipping_packages enable row level security;
revoke all on public.tiktok_shipping_packages from public,anon,authenticated;
grant all on public.tiktok_shipping_packages to service_role;

-- Merge only logistics fields into the latest order. Never replace a concurrent
-- customisation edit, production stage, accounting fields, or status history.
create function public.save_tiktok_shipping_label(p_shop text,p_package text,p_order text,p_url text,p_tracking text,p_courier text) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if p_url !~ '^/media-assets/[a-f0-9]{64}/original$' or p_order !~ '^tiktok-[0-9]{8,25}$' then raise exception 'INVALID_SHIPPING_LABEL'; end if;
  update public.tiktok_shipping_packages set label_url=p_url,tracking_number=p_tracking,courier=p_courier,booking_state='arranged',updated_at=now()
    where shop_id=p_shop and package_id=p_package and order_id=p_order;
  if not found then raise exception 'PACKAGE_LINK_CHANGED'; end if;
  update public.fulfilment_orders o set data=o.data||jsonb_build_object(
    'shippingLabelUrl',p_url,'shippingLabelFileName','tiktok-'||p_package||'.pdf','shippingLabelSource','tiktok',
    'trackingNumber',coalesce(nullif(p_tracking,''),o.data->>'trackingNumber',''),
    'courier',coalesce(nullif(p_courier,''),o.data->>'courier',''),
    'updatedAt',greatest(statement_timestamp(),o.updated_at+interval '1 microsecond')),
    updated_at=greatest(statement_timestamp(),o.updated_at+interval '1 microsecond')
    where o.id=p_order and o.data->>'salesChannel'='tiktok';
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
end;
$$;
revoke all on function public.save_tiktok_shipping_label(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_tiktok_shipping_label(text,text,text,text,text,text) to service_role;
