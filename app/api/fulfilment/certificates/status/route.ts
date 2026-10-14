import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/src/infrastructure/database/prisma";
import { requireMobileSession } from "@/lib/mobile-api";

export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
    const id = new URL(request.url).searchParams.get("orderId") || "";
    if (!id || id.length > 200) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
    const rows = await prisma.$queryRaw<Array<{ revision: number | null; synced_revision: number | null; last_error: string | null; synced_at: Date | null; linked: boolean }>>(Prisma.sql`
      select j.revision, j.synced_revision, j.last_error, j.synced_at,
        (coalesce(o.data->>'certificateCode','') <> '' or exists (
          select 1 from public.customisation_sessions s where s.fulfilment_order_id = o.id and s.certificate_metaobject_id is not null
        )) as linked
      from public.fulfilment_orders o left join public.certificate_sync_jobs j on j.order_id = o.id where o.id = ${id}
    `);
    const row = rows[0];
    if (!row) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    const pending = row.revision !== null && row.revision > (row.synced_revision || 0);
    return NextResponse.json({ status: !row.linked ? "unlinked" : pending ? row.last_error ? "retrying" : "pending" : row.synced_at ? "synced" : "not_checked", error: pending ? row.last_error : null, syncedAt: row.synced_at }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: "Could not check certificate sync." }, { status: message.includes("REQUIRED") ? 401 : 503 });
  }
}
