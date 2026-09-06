import { POST as closerPost } from "@/app/api/closer/route";

export const runtime = "nodejs";

export async function POST(request: Parameters<typeof closerPost>[0]) {
  return closerPost(request);
}
