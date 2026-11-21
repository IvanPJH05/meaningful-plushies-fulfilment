import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type CustomerPackingVideo = {
  verificationRequired: boolean;
  videos: { url: string }[];
  error?: 'verification_failed' | 'rate_limited';
};

export function phoneSuffixMatches(phone: unknown, suffix: string) {
  if (typeof phone !== 'string' || !/^\d{4}$/.test(suffix)) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.endsWith(suffix);
}

export async function customerPackingVideo(
  db: SupabaseClient, orderIds: string[], channel: 'website' | 'tiktok',
  phoneLast4: string, clientAddress: string, secret = process.env.SHOPIFY_CLIENT_SECRET,
): Promise<CustomerPackingVideo | null> {
  const { data, error } = await db.from('packing_proof_videos').select('id,order_id,video_path')
    .in('order_id', orderIds).eq('status', 'ready').order('scanned_at', { ascending: false }).limit(100);
  if (error) throw error;
  const seen = new Set<string>();
  const proofs = (data || []).filter(proof => {
    if (!orderIds.includes(proof.order_id) || seen.has(proof.order_id)
      || !/^[a-f0-9-]{36}$/.test(proof.id) || proof.video_path !== `${proof.id}/proof.mp4`) return false;
    seen.add(proof.order_id); return true;
  });
  if (!proofs.length) return null;
  let allowedIds = proofs.map(proof => proof.order_id);
  if (channel === 'website') {
    const gate: CustomerPackingVideo = { verificationRequired: true, videos: [] };
    if (!phoneLast4) return gate;
    if (!/^\d{4}$/.test(phoneLast4)) return { ...gate, error: 'verification_failed' };
    if (!secret) throw new Error('Packing video verification is not configured');
    const scope = [...orderIds].sort().join('|');
    const hash = (value: string) => createHmac('sha256', secret).update(value).digest('hex');
    const attempt = await db.rpc('consume_customer_packing_video_attempt', {
      p_order_key: hash(`packing-video:order:${scope}`),
      p_client_key: hash(`packing-video:client:${scope}:${clientAddress}`),
    });
    if (attempt.error) throw attempt.error;
    if (attempt.data !== true) return { ...gate, error: 'rate_limited' };
    const phones = await db.from('fulfilment_orders').select('id,phone:data->>phone').in('id', allowedIds);
    if (phones.error) throw phones.error;
    allowedIds = (phones.data || []).filter(order => phoneSuffixMatches(order.phone, phoneLast4)).map(order => order.id);
    if (!allowedIds.length) return { ...gate, error: 'verification_failed' };
  }
  const videos: { url: string }[] = [];
  for (const proof of proofs.filter(proof => allowedIds.includes(proof.order_id))) {
    const signed = await db.storage.from('packing-proof').createSignedUrl(proof.video_path, 900);
    if (!signed.error && signed.data?.signedUrl) videos.push({ url: signed.data.signedUrl });
  }
  return videos.length ? { verificationRequired: false, videos } : null;
}
