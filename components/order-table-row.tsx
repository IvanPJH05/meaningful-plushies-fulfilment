"use client";
import type { ReactNode } from "react";

function isControl(target: EventTarget) {
  return target instanceof Element && Boolean(target.closest("button,a,input,select,textarea,label,[role=button],[role=checkbox]"));
}

export function OrderTableRow({ selected, className, hint, onToggle, onOpen, children, rowIndex }: {
  selected: boolean; className: string; hint: string; onToggle: () => void; onOpen: () => void; children: ReactNode; rowIndex?: number;
}) {
  function open() {
    if (!selected) onToggle();
    onOpen();
  }
  return <tr className={`selectable-order-row ${selected ? "selected-row" : ""} ${className}`} aria-selected={selected} aria-rowindex={rowIndex} tabIndex={0} title={hint}
    onClick={event => { if (!isControl(event.target) && event.detail < 2) onToggle(); }}
    onDoubleClick={event => { if (!isControl(event.target)) open(); }}
    onKeyDown={event => {
      if (isControl(event.target)) return;
      if (event.key === " ") { event.preventDefault(); onToggle(); }
      if (event.key === "Enter") { event.preventDefault(); open(); }
    }}>{children}</tr>;
}
