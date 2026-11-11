-- Called only by the administrator API with its service-role connection.
-- Keep the intake and its customisation consistent in one transaction.
create or replace function public.edit_manual_order_submission(
  p_id uuid, p_expected_updated_at timestamptz, p_intake jsonb,
  p_form jsonb, p_voice_path text default null
) returns void language plpgsql security invoker set search_path = public as $$
declare
  v_intake public.manual_order_intakes%rowtype;
  v_session public.customisation_sessions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_receipts jsonb := p_intake->'payment_receipts';
begin
  select * into v_intake from public.manual_order_intakes where id = p_id for update;
  if not found then raise exception 'This submission no longer exists.'; end if;
  if v_intake.status not in ('awaiting_payment', 'ready_to_create') or coalesce(v_intake.shopify_order_id, '') <> '' then
    raise exception 'This order has already been created or cancelled. Open its linked order to make further changes.';
  end if;
  if p_expected_updated_at is null or v_intake.updated_at is distinct from p_expected_updated_at then
    raise exception 'This submission changed. Close it and reopen the latest details before saving.';
  end if;
  select * into v_session from public.customisation_sessions where id = v_intake.customisation_session_id for update;
  if not found then raise exception 'The linked customisation session could not be found.'; end if;
  if coalesce(v_session.fulfilment_order_id, '') <> '' or coalesce(v_session.order_id, '') <> '' then
    raise exception 'The customisation is already linked to a created order. Refresh before editing.';
  end if;
  if jsonb_typeof(v_receipts) <> 'array' then raise exception 'Invalid receipt list.'; end if;
  if p_voice_path is not null and p_voice_path is distinct from v_session.voice_storage_path then
    if split_part(p_voice_path, '/', 1) <> v_session.id::text or not exists (
      select 1 from storage.objects where bucket_id = 'customisation-audio' and name = p_voice_path
    ) then raise exception 'The replacement voice upload could not be verified.'; end if;
  end if;
  update public.customisation_sessions set
    form_data = coalesce(form_data, '{}'::jsonb) || p_form,
    voice_storage_path = coalesce(p_voice_path, voice_storage_path), updated_at = v_now
    where id = v_session.id;
  update public.manual_order_intakes set
    customer_name = p_intake->>'customer_name', customer_email = p_intake->>'customer_email',
    phone_original = p_intake->>'phone_original', phone_normalized = p_intake->>'phone_normalized',
    character = p_intake->>'character', product_key = p_intake->>'product_key',
    product_display_name = p_intake->>'product_display_name', shopify_variant_id = p_intake->>'shopify_variant_id',
    shipping_region = p_intake->>'shipping_region', shipping_address = p_intake->'shipping_address',
    payment_receipts = v_receipts,
    status = case when jsonb_array_length(v_receipts) > 0 then 'ready_to_create' else 'awaiting_payment' end,
    paid_at = case when jsonb_array_length(v_receipts) > 0 then coalesce(paid_at, v_now) else null end,
    updated_at = v_now
    where id = p_id;
end;
$$;
revoke all on function public.edit_manual_order_submission(uuid,timestamptz,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.edit_manual_order_submission(uuid,timestamptz,jsonb,jsonb,text) to service_role;
