import { creatorUsername, isVipInviteReady, issueVipInvite, listVipInvites } from "@/lib/creator-vip";
import { requireMobileSession } from "@/lib/mobile-api";

export const runtime = "nodejs";
export const maxDuration = 60;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function isAdmin(request: Request) {
  return (await requireMobileSession(request).catch(() => null))?.role === "admin";
}

export async function GET(request: Request) {
  if (!await isAdmin(request)) return json({ error: "Admin access is required." }, 403);
  try {
    const invitations = await listVipInvites();
    return json({ invitations: invitations.map(invitation => ({ ...invitation, ready: isVipInviteReady(invitation) })) });
  } catch (error) {
    console.error("VIP invitation list failed", error);
    return json({ error: "Invitations could not be loaded." }, 503);
  }
}

export async function POST(request: Request) {
  if (!await isAdmin(request)) return json({ error: "Admin access is required." }, 403);
  const input = await request.json().catch(() => null);
  const username = creatorUsername(input?.username);
  if (!username) return json({ error: "Enter a valid TikTok username." }, 422);
  try {
    const invitation = await issueVipInvite(username);
    if (!invitation.redeemed_at && !isVipInviteReady(invitation)) return json({ error: "This invitation’s sample code was removed from the ledger." }, 409);
    return json({ invitation: { ...invitation, ready: isVipInviteReady(invitation) } });
  } catch (error) {
    console.error("VIP invitation creation failed", error);
    return json({ error: "The invitation is pending. Submit the same username to retry Shopify setup." }, 503);
  }
}
