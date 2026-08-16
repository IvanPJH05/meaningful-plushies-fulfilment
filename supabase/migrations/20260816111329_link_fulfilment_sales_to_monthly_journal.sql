alter table public.monthly_journal_entries
  add column if not exists source_reference text;

create unique index if not exists monthly_journal_entries_source_reference_key
  on public.monthly_journal_entries (source, source_reference);

alter table public.monthly_journal_entries
  drop constraint if exists monthly_journal_entries_source_check;

alter table public.monthly_journal_entries
  add constraint monthly_journal_entries_source_check
  check (source = any (array['manual'::text, 'bank_statement'::text, 'shopee_paylater'::text, 'fulfilment_sale'::text]));
