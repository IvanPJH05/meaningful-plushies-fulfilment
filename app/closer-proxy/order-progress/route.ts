import { NextResponse } from 'next/server';
import { verifyUgcProxy } from '@/lib/shopify-proxy-auth';
import { POST as customerOrderProgress } from '@/app/api/customer-order-progress/route';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    verifyUgcProxy(new URL(request.url));
  } catch {
    return NextResponse.json({ error: 'storefront_verification' }, {
      status: 403, headers: { 'Cache-Control': 'no-store' },
    });
  }
  // Reuse the existing lookup and coarse, privacy-limited milestone response.
  // The original iframe endpoint remains compatible during the transition.
  return customerOrderProgress(request);
}
