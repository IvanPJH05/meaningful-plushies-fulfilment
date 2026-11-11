-- One transaction and no media transfer for a whole print/move batch.
create or replace function public.transition_fulfilment_orders(p_transitions jsonb, p_actor text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  current_status text;
  changed_at timestamptz;
  result jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_transitions) is distinct from 'array'
     or jsonb_array_length(p_transitions) not between 1 and 500 then
    raise exception 'INVALID_TRANSITIONS';
  end if;
  if exists (select 1 from jsonb_array_elements(p_transitions) t
    where coalesce(t->>'orderId', '') = ''
      or coalesce(t->>'fromStatus', '') not in ('awaiting_customisation','new_order','uploading_audio','sent_for_sewing','packed','shipped','issue')
      or coalesce(t->>'toStatus', '') not in ('awaiting_customisation','new_order','uploading_audio','sent_for_sewing','packed','shipped','issue'))
    or (select count(distinct t->>'orderId') from jsonb_array_elements(p_transitions) t) <> jsonb_array_length(p_transitions) then
    raise exception 'INVALID_TRANSITIONS';
  end if;

  -- Consistent lock order prevents overlapping batches from deadlocking.
  perform o.id from public.fulfilment_orders o
    where o.id in (select t->>'orderId' from jsonb_array_elements(p_transitions) t)
    order by o.id for update;

  for item in select value from jsonb_array_elements(p_transitions) loop
    select o.status into current_status from public.fulfilment_orders o where o.id = item->>'orderId';
    if not found then raise exception 'ORDER_NOT_FOUND'; end if;
    -- A repeated request after a lost response succeeds without another history entry.
    if current_status <> item->>'toStatus' then
      if current_status <> item->>'fromStatus' then raise exception 'ORDER_CHANGED'; end if;
      changed_at := clock_timestamp();
      update public.fulfilment_orders o set
        status = item->>'toStatus',
        updated_at = changed_at,
        data = o.data || jsonb_build_object(
          'status', item->>'toStatus', 'updatedAt', changed_at,
          'statusHistory', coalesce(o.data->'statusHistory', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'id', gen_random_uuid()::text, 'status', item->>'toStatus',
            'changedAt', changed_at, 'changedBy', p_actor, 'note', coalesce(item->>'note', '')
          )))
        where o.id = item->>'orderId';
    end if;
    result := result || jsonb_build_array((select s.data from public.fulfilment_order_summaries s where s.id = item->>'orderId'));
  end loop;
  return result;
end;
$$;
revoke all on function public.transition_fulfilment_orders(jsonb, text) from public, anon, authenticated;
grant execute on function public.transition_fulfilment_orders(jsonb, text) to service_role;

-- Legacy/import/edit writers still replace JSON. A stale snapshot must never
-- remove a committed transition. A deliberate transition appends to the current
-- history; normal writes preserve the database's status and history.
create or replace function internal.protect_fulfilment_status()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  old_history jsonb := case when jsonb_typeof(old.data->'statusHistory') = 'array' then old.data->'statusHistory' else '[]'::jsonb end;
  new_history jsonb := case when jsonb_typeof(new.data->'statusHistory') = 'array' then new.data->'statusHistory' else '[]'::jsonb end;
  appends_transition boolean;
begin
  appends_transition := jsonb_typeof(new_history) = 'array'
    and jsonb_array_length(new_history) > jsonb_array_length(old_history)
    and new_history @> old_history
    and new_history->-1->>'status' = new.status;
  if not coalesce(appends_transition, false) then
    new.status := old.status;
    new.data := new.data || jsonb_build_object('status', old.status, 'statusHistory', old_history);
  end if;
  -- Server timestamps keep cache ordering independent of a device's clock.
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  new.data := new.data || jsonb_build_object('updatedAt', new.updated_at);
  return new;
end;
$$;
revoke all on function internal.protect_fulfilment_status() from public, anon, authenticated;
create trigger protect_fulfilment_status before update on public.fulfilment_orders
for each row execute function internal.protect_fulfilment_status();
