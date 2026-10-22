"use client";
import { useEffect, useState } from "react";
import { useLanguage } from "./dashboard-language";
export function CreatorSheetLink({ token }: { token: string }) {
  const { t } = useLanguage();
  const [url, setUrl] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/creator-sheet", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const result = await response.json();
      if (typeof result.url === "string" && /^https:\/\/docs\.google\.com\/spreadsheets\/d\//.test(result.url)) setUrl(result.url);
    }).catch(() => {});
    return () => controller.abort();
  }, [token]);
  if (!url) return null;
  return <div className="card" style={{ padding: 16 }}><a className="button secondary" href={url} target="_blank" rel="noreferrer">{t("Open synced Google Sheet")}</a><p>{t("Read-only sync from the app. Google Sheets refreshes imported data about hourly while open. Edit creator details here in the app.")}</p></div>;
}
