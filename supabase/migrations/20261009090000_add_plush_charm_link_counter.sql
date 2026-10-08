-- A deliberately tiny, atomic counter for Our Link IDs. Reading the full
-- fulfilment table to calculate this number repeatedly caused webhook timeouts.
create table if not exists public.plush_charm_link_sequences (
  id boolean primary key default true check (id),
  current_value integer not null default 0 check (current_value between 0 and 999),
  updated_at timestamptz not null default now()
);

insert into public.plush_charm_link_sequences (id, current_value)
values (true, 0)
on conflict (id) do nothing;

create or replace function public.reserve_plush_charm_link_sequence()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare next_value integer;
begin
  update public.plush_charm_link_sequences
  set current_value = current_value + 1,
      updated_at = now()
  where id = true
    and current_value < 999
  returning current_value into next_value;

  if next_value is null then
    raise exception 'PLUSH_CHARM_SEQUENCE_LIMIT_REACHED';
  end if;

  return next_value;
end;
$$;

revoke all on function public.reserve_plush_charm_link_sequence() from public;
grant execute on function public.reserve_plush_charm_link_sequence() to service_role;
