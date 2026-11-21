import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { customisationTrackingReference, resolveCustomisationTracking } from './customer-customisation-tracking.ts';

const id = '12345678-abcd-4321-9876-123456789abc';
function fixture(intakes: object[], session: object | null = null, error: object | null = null) {
  const calls: unknown[][] = [];
  const db = { from(table: string) {
    calls.push(['table', table]);
    const query = {
      select(fields: string) { calls.push(['select', fields]); return query; },
      eq(field: string, value: string) { calls.push(['eq', field, value]); return query; },
      or(filter: string) { calls.push(['or', filter]); return query; },
      limit: () => query, maybeSingle: () => query,
      then(resolve: (value: object) => unknown) { return Promise.resolve({ data: table === 'manual_order_intakes' ? intakes : session, error }).then(resolve); },
    };
    return query;
  } } as unknown as SupabaseClient;
  return { db, calls };
}
test('accepts full MP codes and UUID references case-insensitively, not partial or token input', () => {
  assert.deepEqual(customisationTrackingReference(` mp-${id.toUpperCase()} `), { id, intakeOnly: true });
  assert.deepEqual(customisationTrackingReference(id), { id, intakeOnly: false });
  for (const code of ['2002', 'MP-12345678', 'x'.repeat(64), `${id},id.gt.0`, 'NFC-100001']) assert.equal(customisationTrackingReference(code), null);
});
test('MP code resolves only its stored Shopify mapping, without reading customer data', async () => {
  const f = fixture([{ status: 'created', shopify_order_name: '#2069' }]);
  assert.deepEqual(await resolveCustomisationTracking(f.db, `MP-${id}`), { number: '2069' });
  assert.deepEqual(f.calls, [['table', 'manual_order_intakes'], ['select', 'status,shopify_order_name'], ['eq', 'id', id]]);
});
test('unconfirmed and cancelled codes never reveal a linked number', async () => {
  const pending = fixture([{ status: 'awaiting_payment', shopify_order_name: '#2069' }]);
  assert.deepEqual(await resolveCustomisationTracking(pending.db, `MP-${id}`), { error: 'order_pending' });
  const cancelled = fixture([{ status: 'cancelled', shopify_order_name: '#2069' }]);
  assert.deepEqual(await resolveCustomisationTracking(cancelled.db, `MP-${id}`), { error: 'missing' });
});
test('ambiguous mappings and nonnumeric Shopify names fail closed', async () => {
  const ambiguous = fixture([{ status: 'created', shopify_order_name: '#2069' }, { status: 'created', shopify_order_name: '#2070' }]);
  assert.deepEqual(await resolveCustomisationTracking(ambiguous.db, id), { error: 'missing' });
  const invalid = fixture([{ status: 'created', shopify_order_name: 'TT123 456789012' }]);
  assert.deepEqual(await resolveCustomisationTracking(invalid.db, `MP-${id}`), { error: 'order_pending' });
});
test('raw session references resolve their linked order; MP codes do not fall back to sessions', async () => {
  const f = fixture([], { order_number: '#2069', status: 'submitted' });
  assert.deepEqual(await resolveCustomisationTracking(f.db, id), { number: '2069' });
  assert.equal(JSON.stringify(f.calls).includes('token'), false);
  const mp = fixture([], { order_number: '#9999', status: 'submitted' });
  assert.deepEqual(await resolveCustomisationTracking(mp.db, `MP-${id}`), { error: 'missing' });
  assert.equal(mp.calls.length, 3);
});
test('database failures propagate as unavailable rather than a guessed order', async () => {
  const f = fixture([], null, { message: 'unavailable' });
  await assert.rejects(resolveCustomisationTracking(f.db, `MP-${id}`));
});
