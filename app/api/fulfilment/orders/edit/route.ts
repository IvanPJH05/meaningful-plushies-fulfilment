import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/src/infrastructure/database/prisma";
import { parseOrderEdit } from "@/lib/order-edit";
import type { Order } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await request.text();
    if (body.length > 12_000_000) return NextResponse.json({ error: "Order edit is too large." }, { status: 413 });
    let input: unknown;
    try { input = JSON.parse(body); } catch { return NextResponse.json({ error: "Invalid order edit." }, { status: 400 }); }
    const edit = parseOrderEdit(input);
    const result = await prisma.$transaction(async (tx) => {
      const accounts = await tx.$queryRaw<{ display_name: string; username: string; role: string }[]>(Prisma.sql`
        select a.display_name, a.username, a.role
        from public.dashboard_sessions s join public.dashboard_accounts a on a.id = s.account_id
        where s.token = ${token}::uuid and s.expires_at > now() and a.active
      `);
      if (!accounts[0]) throw new Error("LOGIN_REQUIRED");
      if (accounts[0].role !== "admin") throw new Error("ADMIN_REQUIRED");
      // Merge only edited keys inside Postgres. The version predicate and row
      // lock taken by UPDATE reject concurrent edits without moving media bytes
      // or overwriting an unrelated field from a browser snapshot.
      const rows = await tx.$queryRaw<{ data: Order }[]>(Prisma.sql`
        update public.fulfilment_orders o
        set data = o.data || ${JSON.stringify(edit.patch)}::jsonb || jsonb_build_object(
              'updatedAt', greatest(statement_timestamp(), o.updated_at + interval '1 microsecond')),
            updated_at = greatest(statement_timestamp(), o.updated_at + interval '1 microsecond')
        where o.id = ${edit.orderId} and o.updated_at = ${edit.expectedUpdatedAt}::timestamptz
        returning (o.data - 'photoDataUrl' - 'tikTokFileDataUrl')
          || jsonb_build_object('updatedAt', o.updated_at) as data
      `);
      if (!rows[0]) {
        const existing = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`select id from public.fulfilment_orders where id = ${edit.orderId}`);
        throw new Error(existing.length ? "ORDER_CHANGED" : "ORDER_NOT_FOUND");
      }
      const actor = `${accounts[0].display_name} (${accounts[0].username})`;
      await tx.$executeRaw(Prisma.sql`
        insert into public.activity_events (id, order_number, action, detail, actor, created_at)
        values (${randomUUID()}, ${rows[0].data.orderNumber}, 'Order updated',
          ${`Changed ${Object.keys(edit.patch).join(", ")}.`}, ${actor}, now())
      `);
      return rows[0].data;
    });
    return NextResponse.json({ order: result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAVE_FAILED";
    if (message === "INVALID_ORDER_EDIT") return NextResponse.json({ error: "Invalid order edit." }, { status: 400 });
    if (message === "ORDER_CHANGED") return NextResponse.json({ error: "This order changed since you started editing. Your draft is kept. Review the latest order before saving again." }, { status: 409 });
    if (message === "ORDER_NOT_FOUND") return NextResponse.json({ error: "This order no longer exists." }, { status: 404 });
    if (message === "LOGIN_REQUIRED") return NextResponse.json({ error: "Sign in again to save this order." }, { status: 401 });
    if (message === "ADMIN_REQUIRED") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
    console.error("Order edit failed", error);
    return NextResponse.json({ error: "Order could not be saved. Your draft is kept; please retry." }, { status: 500 });
  }
}
