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
};

const programUrl = "https://meaningfulplushies.com/apps/closer/creators";

export function CreatorVipInvitations({ token }: { token: string }) {
  const [username, setUsername] = useState("");
  const [invites, setInvites] = useState<VipInvitation[]>([]);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/creator-vip", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) throw new Error("Could not load VIP invitations.");
    const { invitations } = await response.json() as { invitations: VipInvitation[] };
    setInvites(invitations);
  }, [token]);

  useEffect(() => {
    void load().catch(() => setMessage("Could not load VIP invitations."));
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
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not create an invitation.");
      const invite = body.invitation as VipInvitation;
      setUsername("");
      setInvites(current => [invite, ...current.filter(item => item.id !== invite.id)]);
      setMessage(`Invitation ready for @${invite.username}.`);
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
          <td>{invite.registered_at ? "Signed up" : invite.sample_id ? "Ready to send" : invite.activated_at ? "Removed" : "Shopify setup pending"}</td>
          <td>{invite.sample_id && !invite.registered_at && <div className="creator-vip-admin__copy">
            <button className="button secondary small" type="button" onClick={() => copyInvite(invite, false)}>Copy English invite</button>
            <button className="button secondary small" type="button" onClick={() => copyInvite(invite, true)}>Copy Malay invite</button>
          </div>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
