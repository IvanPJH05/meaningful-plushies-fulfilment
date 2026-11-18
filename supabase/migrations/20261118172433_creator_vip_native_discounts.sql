alter table public.creator_vip_invites
  add column discount_mode text not null default 'function'
    check (discount_mode in ('function', 'native')),
  add column selected_product_handle text,
  add column shipping_discount_id text;
