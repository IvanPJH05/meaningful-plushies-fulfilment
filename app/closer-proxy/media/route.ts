import { GET as closerMediaGet } from "@/app/api/closer/media/route";

export const runtime = "nodejs";

export async function GET(request: Parameters<typeof closerMediaGet>[0]) {
  return closerMediaGet(request);
}
