import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { isPlushCharmOrder } from "@/lib/plush-charm";
import { fetchSharedOrders, upsertSharedOrders } from "@/lib/supabase";
import { createCloserOrderLink, isOurLinkUrl } from "@/src/modules/closer/service";
import { prisma } from "@/src/infrastructure/database/prisma";

export const runtime = "nodejs";

async function requireAdmin(request: NextRequest) {
  const token = request.headers.get("x-dashboard-session") || "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false;
  const rows = await prisma.$queryRaw<{ is_admin: boolean }[]>(Prisma.sql`select public.dashboard_is_admin(${token}::uuid) as is_admin`);
  return Boolean(rows[0]?.is_admin);
}

/** Creates Our Link IDs for historical Plush Charm orders in one deliberate admin action. */
export async function POST(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });

    const needsLink = (await fetchSharedOrders())
      .filter(isPlushCharmOrder)
      .filter((order) => !isOurLinkUrl(order.idWebsiteLink));

    const now = new Date().toISOString();
    const updated = [];
    // Sequential creation avoids a burst of writes against the same Supabase
    // project while still making every historical Charm order available.
    for (const order of needsLink) {
      updated.push({ ...order, idWebsiteLink: await createCloserOrderLink(order.id), updatedAt: now });
    }
    // A link update does not change sales. Skip needless accounting writes.
    await upsertSharedOrders(updated, { syncSales: false });
    return NextResponse.json({ ok: true, updated: updated.length, orders: updated });
  } catch (error) {
    console.error("Plush Charm Our Link setup failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Our Link IDs could not be generated." }, { status: 500 });
  }
}
