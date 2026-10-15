"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const NotificationTarget = createContext<HTMLElement | null | undefined>(undefined);
const SetNotificationTarget = createContext<(node: HTMLElement | null) => void>(() => {});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return <NotificationTarget.Provider value={target}><SetNotificationTarget.Provider value={setTarget}>{children}</SetNotificationTarget.Provider></NotificationTarget.Provider>;
}

// Keep the original message, retry/dismiss handlers and lifetime. Portals move
// their presentation out of the workflow without copying state or loading data.
export function NotificationMessage({ children }: { children: ReactNode }) {
  const target = useContext(NotificationTarget);
  return target === undefined ? <>{children}</> : target ? createPortal(children, target) : null;
}

export function NotificationBar({ label, emptyLabel }: { label: string; emptyLabel: string }) {
  const setTarget = useContext(SetNotificationTarget);
  return <aside className="notification-bar" aria-label={label}>
    <strong>{label}</strong>
    <div ref={setTarget} className="notification-messages" aria-live="polite" aria-relevant="additions text" data-empty={emptyLabel} />
  </aside>;
}
