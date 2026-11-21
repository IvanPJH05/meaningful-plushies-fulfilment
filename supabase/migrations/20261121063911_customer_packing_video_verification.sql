-- Only hashes and attempt counts are retained; no phone numbers or addresses.
create table public.customer_packing_video_limits (
  scope_key text primary key check (scope_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0)
);
create index customer_packing_video_limits_window_idx on public.customer_packing_video_limits(window_started_at);
alter table public.customer_packing_video_limits enable row level security;
revoke all on public.customer_packing_video_limits from public, anon, authenticated;
grant select, insert, update, delete on public.customer_packing_video_limits to service_role;

create function public.consume_customer_packing_video_attempt(p_order_key text, p_client_key text)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare order_attempts integer; client_attempts integer; at_time timestamptz := clock_timestamp();
begin
  if coalesce(p_order_key,'') !~ '^[a-f0-9]{64}$' or coalesce(p_client_key,'') !~ '^[a-f0-9]{64}$' or p_order_key=p_client_key then
    raise exception 'Invalid verification scope';
  end if;
  delete from public.customer_packing_video_limits where window_started_at < at_time - interval '1 day';
  insert into public.customer_packing_video_limits values (p_order_key,at_time,1)
  on conflict (scope_key) do update set
    attempts = case when customer_packing_video_limits.window_started_at < at_time - interval '15 minutes' then 1 else customer_packing_video_limits.attempts+1 end,
    window_started_at = case when customer_packing_video_limits.window_started_at < at_time - interval '15 minutes' then at_time else customer_packing_video_limits.window_started_at end
  returning attempts into order_attempts;
  insert into public.customer_packing_video_limits values (p_client_key,at_time,1)
  on conflict (scope_key) do update set
    attempts = case when customer_packing_video_limits.window_started_at < at_time - interval '15 minutes' then 1 else customer_packing_video_limits.attempts+1 end,
    window_started_at = case when customer_packing_video_limits.window_started_at < at_time - interval '15 minutes' then at_time else customer_packing_video_limits.window_started_at end
  returning attempts into client_attempts;
  return order_attempts <= 20 and client_attempts <= 5;
end;
$$;
revoke all on function public.consume_customer_packing_video_attempt(text,text) from public,anon,authenticated;
grant execute on function public.consume_customer_packing_video_attempt(text,text) to service_role;
