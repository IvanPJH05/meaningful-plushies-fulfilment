alter table public.production_batches
  drop constraint production_batches_production_date_key;

create index production_batches_date_number_idx
  on public.production_batches (production_date desc, batch_number desc);
