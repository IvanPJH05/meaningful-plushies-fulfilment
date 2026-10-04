import { NextResponse } from "next/server";
import { mobileLogin } from "../../../../lib/mobile-api";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { username?: string; password?: string };
    if (!body.username?.trim() || !body.password) return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
    return NextResponse.json(await mobileLogin(body.username, body.password));
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_CREDENTIALS";
    return NextResponse.json({ error: code === "WAREHOUSE_ACCESS_REQUIRED" ? "This account does not have warehouse access." : "Incorrect username or password." }, { status: 401 });
  }
}

export function OPTIONS() { return new NextResponse(null, { status: 204 }); }
