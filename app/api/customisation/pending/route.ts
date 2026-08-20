import { NextResponse } from "next/server";

import { listPendingCustomisations } from "../../../../lib/customisation";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, sessions: await listPendingCustomisations() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not load pending customisations." }, { status: 500 });
  }
}
