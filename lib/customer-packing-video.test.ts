import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { customerPackingVideo, phoneSuffixMatches } from './customer-packing-video.ts';

const first = '12345678-1234-1234-1234-123456789abc';
const second = '22345678-1234-1234-1234-123456789abc';
const proof = (id = first, order_id = 'one') => ({ id, order_id, video_path: `${id}/proof.mp4` });
function fixture(proofs = [proof()], limit = true) {
  const signed: string[] = [], attempts: object[] = [];
  const db = {
    from(table: string) {
      const data = table === 'packing_proof_videos' ? proofs : [{ id: 'one', phone: '+60 12-123 4321' }, { id: 'two', phone: '0121239999' }];
      const query = { select: () => query, in: () => query, eq: () => query, order: () => query, limit: () => query,
        then(resolve: (value: object) => unknown) { return Promise.resolve({ data, error: null }).then(resolve); } };
      return query;
    },
    rpc(_name: string, args: object) { attempts.push(args); return Promise.resolve({ data: limit, error: null }); },
    storage: { from(bucket: string) { assert.equal(bucket, 'packing-proof'); return {
      async createSignedUrl(path: string, ttl: number) { assert.equal(ttl, 900); signed.push(path); return { data: { signedUrl: `https://example.test/${path}` }, error: null }; },
    }; } },
  } as unknown as SupabaseClient;
  return { db, signed, attempts };
}

test('normalizes phone punctuation and rejects short/malformed suffixes', () => {
  assert.equal(phoneSuffixMatches('+60 12-123 4321', '4321'), true);
  for (const phone of [null, '4321', '0121239999']) assert.equal(phoneSuffixMatches(phone, '4321'), false);
  assert.equal(phoneSuffixMatches('0121234321', '321'), false);
});
test('no footage returns nothing; website never signs before successful verification', async () => {
  const empty = fixture([]);
  assert.equal(await customerPackingVideo(empty.db, ['one'], 'website', '', 'ip', 'test-secret'), null);
  const f = fixture();
  assert.deepEqual(await customerPackingVideo(f.db, ['one'], 'website', '', 'ip', 'test-secret'), { verificationRequired: true, videos: [] });
  const wrong = await customerPackingVideo(f.db, ['one'], 'website', '0000', 'ip', 'test-secret');
  assert.equal(wrong?.error, 'verification_failed'); assert.equal(f.signed.length, 0);
  const scope = JSON.stringify(f.attempts);
  assert.equal(scope.includes('ip'), false); assert.equal(scope.includes('one'), false);
});
test('correct phone authorizes only its split record and exact finished video paths', async () => {
  const f = fixture([proof(), proof(second, 'two'), proof(first, 'foreign'), { ...proof(second), video_path: 'other/proof.mp4' }]);
  const result = await customerPackingVideo(f.db, ['one', 'two'], 'website', '4321', 'ip', 'test-secret');
  assert.equal(result?.verificationRequired, false); assert.equal(result?.videos.length, 1);
  assert.deepEqual(f.signed, [`${first}/proof.mp4`]);
});
test('rate limit blocks even correct phone; missing signing secret fails closed', async () => {
  const f = fixture([proof()], false);
  assert.equal((await customerPackingVideo(f.db, ['one'], 'website', '4321', 'ip', 'test-secret'))?.error, 'rate_limited');
  assert.equal(f.signed.length, 0);
  await assert.rejects(customerPackingVideo(f.db, ['one'], 'website', '4321', 'ip', ''), /not configured/);
});
test('TikTok receives only matching ready proof with no phone challenge', async () => {
  const f = fixture([proof(), proof(second, 'foreign')]);
  const result = await customerPackingVideo(f.db, ['one'], 'tiktok', '', 'ip');
  assert.equal(result?.verificationRequired, false); assert.equal(result?.videos.length, 1);
  assert.equal(f.attempts.length, 0);
});
