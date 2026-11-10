"use client";

import { useEffect, useState } from "react";
import styles from "./social-media-manager.module.css";

export function SocialMediaManager({ token }: { token: string }) {
  const [result, setResult] = useState<{ token: string; html?: string; error?: string }>();

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/social-media-manager", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(await response.text());
      return response.text();
    }).then(html => {
      if (!controller.signal.aborted) setResult({ token, html });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ token, error: "Could not open Social Media Manager. Check your administrator sign-in and reopen the workspace." });
    });
    return () => controller.abort();
  }, [token]);

  if (result?.token !== token) return <p role="status">Loading Social Media Manager…</p>;
  if (result.error) return <p role="alert">{result.error}</p>;
  return <iframe className={styles.frame} title="Social Media Manager" srcDoc={result.html} referrerPolicy="no-referrer" />;
}
