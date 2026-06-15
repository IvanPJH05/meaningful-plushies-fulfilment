import { cookies } from "next/headers";
import { CANVA_REFRESH_COOKIE, canvaConfigured } from "../../../../lib/canva-auth";

export async function GET() {
  const cookieStore = await cookies();
  return Response.json({
    configured: canvaConfigured(),
    connected: Boolean(cookieStore.get(CANVA_REFRESH_COOKIE)?.value),
  });
}
