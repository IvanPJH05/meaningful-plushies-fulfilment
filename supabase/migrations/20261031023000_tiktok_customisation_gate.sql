-- Runs after protect_fulfilment_status, so edits can complete customisation
-- without weakening the existing stale-write protection.
create function internal.tiktok_customisation_ready(d jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
  select (
    coalesce(d->>'meaningfulMessage','') ~ '^(https?://|data:audio/|data:video/)'
    or (coalesce(d->>'tikTokFileDataUrl','') <> '' and (
      coalesce(d->>'tikTokFileType','') ~ '^(audio|video)/'
      or coalesce(d->>'tikTokFileDataUrl','') ~ '^data:(audio|video)/'
      or coalesce(d->>'tikTokFileName','') ~* '\.(mp3|wav|m4a|aac|ogg|opus|flac|mp4|mov|webm)$'
    ))
  ) and (
    coalesce(d->>'productType','') in ('plush_charm','snowy_charm')
    or concat_ws(' ',d->>'product',d->>'remark') ~* '\mplush\s*charms?\M'
    or (btrim(coalesce(d->>'plushName','')) <> '' and btrim(coalesce(d->>'character','')) <> '')
  );
$$;
revoke all on function internal.tiktok_customisation_ready(jsonb) from public,anon,authenticated;
grant execute on function internal.tiktok_customisation_ready(jsonb) to service_role;

create function internal.gate_tiktok_customisation() returns trigger
language plpgsql security invoker set search_path='' as $$
declare ready boolean; changed_at timestamptz;
begin
  if new.data->>'salesChannel' is distinct from 'tiktok' then return new; end if;
  ready := internal.tiktok_customisation_ready(new.data);
  if old.status = 'awaiting_customisation' then
    if new.status not in ('awaiting_customisation','issue') and not ready then
      raise exception 'Save the customer voice, plush name and character before moving this TikTok order to production.';
    end if;
    -- Only completion of missing information promotes an awaiting order.
    -- An unrelated edit or repeated sync must not append another transition.
    if new.status = 'awaiting_customisation' and ready
      and not internal.tiktok_customisation_ready(old.data) then
      changed_at := clock_timestamp();
      new.status := 'new_order';
      new.updated_at := greatest(changed_at,new.updated_at);
      new.data := new.data || jsonb_build_object('status','new_order','updatedAt',new.updated_at,
        'voiceUploadStatus',case when new.data->>'voiceUploadStatus'='checked' then 'checked' else 'received' end,
        'statusHistory',coalesce(new.data->'statusHistory','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
          'id',gen_random_uuid()::text,'status','new_order','changedAt',changed_at,
          'changedBy','Fulfilment','note','Customer voice and plushie details saved. Ready for production.')));
    end if;
  end if;
  return new;
end;
$$;
revoke all on function internal.gate_tiktok_customisation() from public,anon,authenticated;
create trigger zz_tiktok_customisation_gate before update on public.fulfilment_orders
for each row execute function internal.gate_tiktok_customisation();
