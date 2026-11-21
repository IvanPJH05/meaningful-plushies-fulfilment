import type { SupabaseClient } from '@supabase/supabase-js';

export function customisationTrackingReference(value: string) {
  const match = /^(MP-)?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.exec(value.trim());
  return match ? { id: match[2].toLowerCase(), intakeOnly: Boolean(match[1]) } : null;
}

type Resolution = { number: string } | { error: 'missing' | 'order_pending' };
const cleanNumber = (value: unknown) => typeof value === 'string' && /^#?\d{1,10}$/.test(value.trim())
  ? value.trim().replace(/^#/, '') : '';

export async function resolveCustomisationTracking(db: SupabaseClient, value: string): Promise<Resolution> {
  const code = customisationTrackingReference(value);
  if (!code) return { error: 'missing' };
  const query = db.from('manual_order_intakes').select('status,shopify_order_name').limit(3);
  const result = code.intakeOnly ? await query.eq('id', code.id)
    : await query.or(`id.eq.${code.id},customisation_session_id.eq.${code.id}`);
  if (result.error) throw result.error;
  if (result.data?.length === 3) return { error: 'missing' };
  if (result.data?.length) {
    const numbers = [...new Set(result.data.filter(row => row.status === 'created')
      .map(row => cleanNumber(row.shopify_order_name)).filter(Boolean))];
    if (numbers.length === 1) return { number: numbers[0] };
    if (numbers.length > 1 || result.data.every(row => row.status === 'cancelled')) return { error: 'missing' };
    return { error: 'order_pending' };
  }
  if (code.intakeOnly) return { error: 'missing' };
  const session = await db.from('customisation_sessions').select('order_number,status')
    .eq('id', code.id).maybeSingle();
  if (session.error) throw session.error;
  if (!session.data || session.data.status === 'cancelled') return { error: 'missing' };
  const number = cleanNumber(session.data.order_number);
  return number ? { number } : { error: 'order_pending' };
}
