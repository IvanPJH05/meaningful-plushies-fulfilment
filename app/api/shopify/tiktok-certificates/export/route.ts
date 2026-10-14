import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/src/infrastructure/database/prisma";
import { requireMobileSession } from "@/lib/mobile-api";

export const runtime = "nodejs";
/** Requeue authoritative records; never send editable JSON through Shopify Flow. */
export async function POST(request: Request) {
  try {
    const session = await requireMobileSession(request);
    if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
    const body = await request.json();
    const ids: unknown = body.orderIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 200 || ids.some(id => typeof id !== "string" || id.length > 200)) return NextResponse.json({ error: "Select up to 200 TikTok orders." }, { status: 400 });
    const rows = await prisma.$queryRaw<Array<{ order_id: string }>>(Prisma.sql`
      insert into public.certificate_sync_jobs(order_id)
      select id from public.fulfilment_orders where id in (${Prisma.join([...new Set(ids as string[])])})
        and data->>'salesChannel'='tiktok' and coalesce(data->>'certificateCode','')<>''
        and btrim(coalesce(data->>'plushName',''))<>''
        and coalesce(data->>'productType','') not in ('plush_charm','snowy_charm')
        and concat(data->>'product',' ',data->>'remark') !~* '(^|[^[:alnum:]_])plush[[:space:]]*charms?([^[:alnum:]_]|$)'
      on conflict(order_id) do update set revision=public.certificate_sync_jobs.revision+1,
        next_attempt_at=now(),last_error=null,attempts=0 returning order_id
    `);
    return NextResponse.json({ ok: true, count: rows.length, skipped: ids.length-rows.length }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "QUEUE_FAILED";
    return NextResponse.json({ error: message.includes("REQUIRED") ? "Sign in required." : "Certificates could not be queued." }, { status: message.includes("REQUIRED") ? 401 : 500 });
  }
}
