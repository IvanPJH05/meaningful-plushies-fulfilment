alter table public.production_batches add column batch_number integer;
with numbered as (
  select id, row_number() over (order by created_at, id)::integer as number
  from public.production_batches
)
update public.production_batches b set batch_number = n.number from numbered n where b.id = n.id;
create sequence public.production_batch_number_seq as integer owned by public.production_batches.batch_number;
select setval('public.production_batch_number_seq', coalesce(max(batch_number), 0) + 1, false)
from public.production_batches;
alter table public.production_batches
  alter column batch_number set default nextval('public.production_batch_number_seq'),
  alter column batch_number set not null,
  add unique (batch_number);
grant usage on sequence public.production_batch_number_seq to service_role;
