"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export function TikTokTutorialSettings({ token }: { token: string }) {
  const [video, setVideo] = useState<{ url: string; updatedAt: string } | null>(null);
  const [deliveries, setDeliveries] = useState<{ order_id: string; status: string; sent_at: string | null; error: string | null }[]>([]);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function request(body?: object) {
    const response = await fetch("/api/tiktok/tutorial", {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load the tutorial.");
    return result;
  }

  async function run(action?: "upload" | "remove" | "pilot" | "retry", orderId?: string) {
    setBusy(true);
    setNotice("");
    try {
      if (action === "upload") {
        const file = input.current?.files?.[0];
        if (!file || !/\.mp4$/i.test(file.name) || !file.size || file.size > 100000000) {
          throw new Error("Choose an MP4 up to 100 MB.");
        }
        if (!supabase) throw new Error("Storage is unavailable.");
        const { upload, revision } = await request({ action: "prepare" });
        const result = await supabase.storage.from("tiktok-tutorial").uploadToSignedUrl(
          upload.path, upload.token, file, { contentType: "video/mp4" },
        );
        if (result.error) throw new Error("Could not upload the tutorial video.");
        await request({ action: "activate", path: upload.path, revision });
        if (input.current) input.current.value = "";
      } else if (action) {
        await request({ action, orderId });
      }
      const result = await request();
      setVideo(result.video);
      setDeliveries(result.deliveries);
      if (action) setNotice(action === "upload" ? "Tutorial video saved." : action === "remove" ? "Tutorial video removed." : "Delivery request saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load the tutorial.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void run(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-labelledby="tutorial-video-heading">
      <h2 id="tutorial-video-heading">Tutorial Video</h2>
      <p>Send the tutorial in TikTok Buyer Messages. The pilot verifies delivery before automatic sending is enabled.</p>
      {video ? (
        <>
          <video key={video.url} src={video.url} controls preload="metadata" style={{ width: "100%", maxWidth: 480 }} />
          <p>Active video · Updated {new Date(video.updatedAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</p>
        </>
      ) : <p>{busy ? "Loading tutorial video…" : "No active video."}</p>}
      <label>MP4 video (up to 100 MB)<input ref={input} type="file" accept="video/mp4,.mp4" disabled={busy} /></label>
      <button className="button secondary" disabled={busy} onClick={() => void run("upload")}>
        {video ? "Replace video" : "Upload video"}
      </button>
      {video && <button className="button secondary" disabled={busy} onClick={() => void run("remove")}>Remove video</button>}
      <div>
        <button className="button secondary" disabled={busy || !video || deliveries.some(job => job.order_id === "tiktok-586945542722586535")} onClick={() => void run("pilot")}>Queue TT1419 pilot</button>
        <button className="button secondary" disabled={busy} onClick={() => void run()}>Refresh delivery status</button>
      </div>
      {deliveries.length > 0 && <ul>{deliveries.map(job => (
        <li key={job.order_id}>
          {job.order_id.replace(/^tiktok-/, "")} · {job.status === "sending" ? "Pending (sending)" : job.status === "uncertain" ? "Needs review" : job.status}
          {job.sent_at && " · " + new Date(job.sent_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}
          {job.error && " · " + job.error}
          {job.status === "failed" && <button className="button secondary" disabled={busy || !video} onClick={() => void run("retry", job.order_id)}>Retry</button>}
        </li>
      ))}</ul>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
