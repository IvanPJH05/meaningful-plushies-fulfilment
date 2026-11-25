-- Computed scalar: audio identity changes only when its source changes, not
-- when tracking, status, certificates or packing-slip timestamps are edited.
-- An unnamed row argument keeps it out of the RPC interface.
create function public.packing_audio_revision(public.fulfilment_orders)
returns text language sql stable security invoker set search_path='' as $$
  select md5(btrim(coalesce(case when $1.data->>'salesChannel'='tiktok'
    then $1.data->>'tikTokFileDataUrl' else $1.data->>'meaningfulMessage' end,'')));
$$;
revoke all on function public.packing_audio_revision(public.fulfilment_orders) from public,anon,authenticated;
grant execute on function public.packing_audio_revision(public.fulfilment_orders) to service_role;
notify pgrst,'reload schema';
