import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/src/infrastructure/database/prisma";

export const runtime = "nodejs";

type DashboardSessionRow = {
  id: string;
  token: string;
  username: string;
  display_name: string;
  role: "admin" | "staff" | "creator";
};

/**
 * Extends a valid dashboard session without ever receiving or storing a
 * password. This makes the saved trusted-device session survive normal reloads
 * and deployments while still requiring a fresh sign-in after expiry or logout.
 */
export async function POST(request: NextRequest) {
  const token = request.headers.get("x-dashboard-session") || "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await prisma.$queryRaw<DashboardSessionRow[]>(Prisma.sql`
      update public.dashboard_sessions as session
      set expires_at = now() + interval '30 days'
      from public.dashboard_accounts as account
      where session.token = ${token}::uuid
        and session.account_id = account.id
        and session.expires_at > now()
        and account.active
      returning account.id, session.token, account.username, account.display_name, account.role
    `);
    const account = rows[0];
    if (!account) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    return NextResponse.json({
      session: {
        id: account.id,
        token: account.token,
        username: account.username,
        displayName: account.display_name,
        role: account.role,
        active: true,
      },
    });
  } catch (error) {
    console.error("Dashboard session refresh failed", error);
    return NextResponse.json({ error: "Could not refresh the dashboard sign-in." }, { status: 500 });
  }
}
