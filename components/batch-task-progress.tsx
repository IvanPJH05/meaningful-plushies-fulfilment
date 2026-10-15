"use client";
import { useEffect, useState } from "react";
import { useLanguage } from "./dashboard-language";

export function BatchTaskProgress({ label, started, estimate, completed, total }: { label: string; started: number; estimate: number; completed?: number; total?: number }) {
  const { t } = useLanguage();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const elapsed = started ? Math.max(0, (now - started) / 1000) : 0;
  const measured = total && completed === total ? 3 - elapsed : completed && total ? elapsed / completed * (total - completed) + 3 : estimate - elapsed;
  const seconds = Math.ceil(Math.max(0, measured));
  const percent = total ? Math.min(97, Math.round(((completed ?? 0) / total) * 95)) : Math.min(95, Math.round(100 * elapsed / (estimate + elapsed)));
  return <div className="batch-task-progress" role="status">
    <div><strong>{label}</strong><span>{total ? `${completed ?? 0}/${total}` : `${percent}%`}</span></div>
    <progress max={100} value={percent} aria-label={label} />
    <small>{seconds > 0 ? `${t("Approx. time remaining")}: ${seconds >= 60 ? `${Math.ceil(seconds / 60)} ${t("min")}` : `${seconds} ${t("sec")}`}` : t("Taking longer than estimated — still working.")}{!total && ` · ${t("Estimated progress")}`}</small>
  </div>;
}
