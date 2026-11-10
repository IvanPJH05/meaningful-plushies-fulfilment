import { createHash } from "node:crypto";
import { requireMobileSession } from "@/lib/mobile-api";
import { studio } from "./studio";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const session = await requireMobileSession(request);
    if (session.role === "admin") {
      const accountKey = createHash("sha256").update(session.username).digest("hex");
      return new Response(studio.replace("__SOCIAL_STORE__", accountKey), {
        headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  } catch {
    // Use the same response for missing, expired and unauthorized sessions.
  }
  return new Response("Administrator sign-in is required.", { status: 403, headers });
}
