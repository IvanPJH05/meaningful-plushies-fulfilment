"use client";
import { useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";
import { visibleRows } from "../lib/visible-rows";

function useRows(count: number, rowHeight: number, resetKey: string, headerHeight = 0) {
  const scroller = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const latestScroll = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(480);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const measure = () => setHeight(Math.max(1, node.clientHeight - headerHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => { observer.disconnect(); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [headerHeight]);
  useEffect(() => {
    latestScroll.current = 0;
    if (scroller.current) scroller.current.scrollTop = 0;
    setScrollTop(0);
  }, [resetKey]);
  function onScroll(event: UIEvent<HTMLDivElement>) {
    latestScroll.current = event.currentTarget.scrollTop;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      // Moving horizontally or within the same row need not rebuild the rows.
      setScrollTop(current => Math.floor(current / rowHeight) === Math.floor(latestScroll.current / rowHeight) ? current : latestScroll.current);
    });
  }
  return { scroller, onScroll, ...visibleRows(count, scrollTop, height, rowHeight) };
}

export function VirtualOrderTable<T>({ items, renderRow, header, columns, columnCount, minWidth, className, resetKey, label }: {
  items: T[]; renderRow: (item: T, index: number) => ReactNode; header: ReactNode; columns: ReactNode;
  columnCount: number; minWidth: number; className: string; resetKey: string; label: string;
}) {
  const rows = useRows(items.length, 48, resetKey, 42);
  const spacer = (height: number, key: string) => height > 0 ? <tr key={key} aria-hidden="true"><td colSpan={columnCount} style={{ height, padding: 0, border: 0 }} /></tr> : null;
  return <div ref={rows.scroller} onScroll={rows.onScroll} tabIndex={0} role="region" aria-label={label} className="table-scroll virtual-order-scroll" style={{ height: Math.min(600, 42 + items.length * 48) }}>
    <table className={`${className} virtual-order-table`} style={{ minWidth }} aria-rowcount={items.length + 1}>
      {columns}<thead>{header}</thead><tbody>
        {spacer(rows.before, "before")}
        {items.slice(rows.start, rows.end).map((item, index) => renderRow(item, rows.start + index))}
        {spacer(rows.after, "after")}
      </tbody>
    </table>
  </div>;
}

export function VirtualPackingList<T>({ items, renderItem, resetKey, label }: {
  items: T[]; renderItem: (item: T) => ReactNode; resetKey: string; label: string;
}) {
  const rows = useRows(items.length, 88, resetKey);
  return <div ref={rows.scroller} onScroll={rows.onScroll} tabIndex={0} role="region" aria-label={label} className="packing-order-list virtual-packing-list" style={{ height: Math.min(560, items.length * 88) }}>
    <div aria-hidden="true" style={{ height: rows.before }} />
    {items.slice(rows.start, rows.end).map(renderItem)}
    <div aria-hidden="true" style={{ height: rows.after }} />
  </div>;
}
