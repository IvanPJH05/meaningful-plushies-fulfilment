import { NextResponse } from "next/server";
import { approveManualOrderCod, getManualOrderIntakeDetails, listManualOrderIntakes } from "../../../../lib/manual-order-intakes";
import { requireMobileSession } from "../../../../lib/mobile-api";

export async function GET(request: Request) {
  try {
    const session = await requireMobileSession(request);
    if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
    return NextResponse.json({ intakes: await listManualOrderIntakes() });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "MANUAL_ORDERS_FAILED" }, { status: 500 }); }
}
export async function POST(request: Request) {
  try {
    const session = await requireMobileSession(request);
    if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
    const body = await request.json() as { action?: string; id?: string };
    if (body.action === "details") return NextResponse.json({ details: await getManualOrderIntakeDetails(String(body.id || "")) });
    if (body.action === "approve_cod") return NextResponse.json({ intake: await approveManualOrderCod(String(body.id || "")) });
    return NextResponse.json({ error: "That Manual Order action is not supported in the app yet." }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "MANUAL_ORDER_ACTION_FAILED" }, { status: 500 }); }
}
export function OPTIONS() { return new NextResponse(null, { status: 204 }); }
