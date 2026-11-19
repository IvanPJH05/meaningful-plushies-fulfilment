"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type VipInvitation = {
  id: string;
  code: string;
  username: string;
  discount_code: string;
  sample_id: string | null;
  activated_at: string | null;
  registered_at: string | null;
  name: string | null;
  phone: string | null;
  ready: boolean;
  redeemed_at: string | null;
};

const programUrl = "https://meaningfulplushies.com/apps/closer/creators";

async function readInvitationResponse<T>(response: Response, fallback: string): Promise<T> {
  if (response.status === 404) {
    throw new Error("VIP invitations are unavailable on this version of Fulfilment. Refresh the page and try again.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("Sign back in as an administrator to manage VIP invitations.");
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error(fallback);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw new Error(typeof body?.error === "string" ? body.error : fallback);
  }
  return body as T;
}

export function CreatorVipInvitations({ token }: { token: string }) {
  const [username, setUsername] = useState("");
  const [invites, setInvites] = useState<VipInvitation[]>([]);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/creator-vip", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const { invitations } = await readInvitationResponse<{ invitations: VipInvitation[] }>(response, "Could not load VIP invitations. Refresh the page to retry.");
    setInvites(invitations);
  }, [token]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch("/api/creator-vip", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const { invitation: invite } = await readInvitationResponse<{ invitation: VipInvitation }>(
        response, "Could not create the invitation. Submit the same TikTok username to retry.",
      );
      setUsername("");
      setInvites(current => [invite, ...current.filter(item => item.id !== invite.id)]);
      setMessage(invite.redeemed_at ? `@${invite.username} has already redeemed their product discount.` : `Invitation ready for @${invite.username}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create an invitation.");
    } finally {
      setWorking(false);
    }
  }

  async function copyInvite(invite: VipInvitation, malay: boolean) {
    const link = `${programUrl}${malay ? "?lang=ms" : ""}`;
    const text = malay
      ? `Jemputan Program Pencipta VIP Meaningful Plushies\n${link}\nKod jemputan: ${invite.code}`
      : `Meaningful Plushies VIP Creator Program invitation\n${link}\nInvitation code: ${invite.code}`;
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`Copied the invitation for @${invite.username}.`);
    } catch {
      setMessage("Copy the signup link and invitation code shown here.");
    }
  }

  return <section className="card creator-vip-admin">
    <h3>VIP Creator Invitations</h3>
    <p>Generate a creator’s invitation and Shopify discount together. Copy the invitation to send it to the creator.</p>
    <form onSubmit={issue}>
      <label htmlFor="vip-creator-username">TikTok username</label>
      <input id="vip-creator-username" value={username} onChange={event => setUsername(event.target.value)} placeholder="@username" autoComplete="off" spellCheck={false} maxLength={25} required />
      <button className="button primary" type="submit" disabled={working}>{working ? "Creating invitation…" : "Generate invitation and discount"}</button>
    </form>
    {message && <p role="status">{message}</p>}
    <p><a href={programUrl} target="_blank" rel="noreferrer">English signup</a> · <a href={`${programUrl}?lang=ms`} target="_blank" rel="noreferrer">Bahasa Melayu signup</a></p>
    {invites.length > 0 && <div className="creator-vip-admin__list">
      <table>
        <thead><tr><th>Creator</th><th>Invitation</th><th>Discount</th><th>Status</th><th>Share</th></tr></thead>
        <tbody>{invites.map(invite => <tr key={invite.id}>
          <td><strong>@{invite.username}</strong>{invite.name && <small>{invite.name} · {invite.phone}</small>}</td>
          <td><code>{invite.code}</code></td>
          <td><code>{invite.discount_code}</code></td>
          <td>{invite.redeemed_at ? "Redeemed" : invite.registered_at ? "Details saved · Awaiting order" : invite.ready ? "Ready to send" : invite.activated_at ? "Removed" : "Shopify setup pending"}</td>
          <td>{invite.ready && <div className="creator-vip-admin__copy">
            <button className="button secondary small" type="button" onClick={() => copyInvite(invite, false)}>Copy English invite</button>
            <button className="button secondary small" type="button" onClick={() => copyInvite(invite, true)}>Copy Malay invite</button>
          </div>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
