"use client";
import { useEffect, useState } from "react";
import { useLanguage } from "./dashboard-language";
import { defaultTableLayout, tableColumns, type ColumnLayout, type TableLayouts, type TableView } from "../lib/table-layout";

export default function TableLayoutEditor({ layouts, initialView, onSave, onClose }: {
  layouts: TableLayouts; initialView: TableView; onSave: (value: TableLayouts) => void; onClose: () => void;
}) {
  const { t } = useLanguage();
  const [view, setView] = useState(initialView);
  const [draft, setDraft] = useState(layouts);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  function change(columns: ColumnLayout[]) { setDraft(current => ({ ...current, [view]: columns })); }
  function move(index: number, offset: number) {
    const columns = [...draft[view]];
    [columns[index], columns[index + offset]] = [columns[index + offset], columns[index]];
    change(columns);
  }
  return <div className="layout-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="layout-dialog" role="dialog" aria-modal="true" aria-labelledby="layout-title" onKeyDown={event => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled)");
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && event.target === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && event.target === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <header><div><h2 id="layout-title">{t("Table layout")}</h2><p>{t("Choose columns, their order and width. Saved on this browser. Orders stay on one line.")}</p></div><button className="view-button" autoFocus onClick={onClose} aria-label={t("Close")}>×</button></header>
      <div className="layout-tabs">{(["orders", "fulfilment"] as const).map(value => <button key={value} className={`button ${view === value ? "primary" : "secondary"}`} onClick={() => setView(value)}>{t(value === "orders" ? "Orders" : "Fulfilment")}</button>)}</div>
      <div className="layout-column-list">{draft[view].map((column, index) => <div className="layout-column" key={column.key}>
        <label><input type="checkbox" checked={column.visible} disabled={column.key === "orderNumber"} onChange={event => change(draft[view].map(item => item.key === column.key ? { ...item, visible: event.target.checked } : item))} />{t(tableColumns[column.key][0])}</label>
        <label className="layout-width"><input aria-label={`${t(tableColumns[column.key][0])} ${t("Width")}`} type="number" min={70} max={600} step={10} value={column.width} onChange={event => change(draft[view].map(item => item.key === column.key ? { ...item, width: Math.max(70, Math.min(600, Number(event.target.value) || 70)) } : item))} /><span>px</span></label>
        <button className="view-button" disabled={index === 0} aria-label={`${t("Move up")} ${t(tableColumns[column.key][0])}`} onClick={() => move(index, -1)}>↑</button>
        <button className="view-button" disabled={index === draft[view].length - 1} aria-label={`${t("Move down")} ${t(tableColumns[column.key][0])}`} onClick={() => move(index, 1)}>↓</button>
      </div>)}</div>
      <footer><button className="button secondary" onClick={() => change(defaultTableLayout(view))}>{t("Reset layout")}</button><button className="button secondary" onClick={onClose}>{t("Cancel")}</button><button className="button primary" onClick={() => { onSave(draft); onClose(); }}>{t("Save")}</button></footer>
    </section>
  </div>;
}
