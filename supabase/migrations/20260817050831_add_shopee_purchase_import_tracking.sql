alter table public.monthly_journal_shopee_purchases
  add column if not exists source_reference text not null default '',
  add column if not exists receipt_path text not null default '';

create unique index if not exists monthly_journal_shopee_purchases_source_reference_key
  on public.monthly_journal_shopee_purchases (source_reference)
  where source_reference <> '';
