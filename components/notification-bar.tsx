"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, useId, Children, isValidElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LoadingIndicator } from "./loading-indicator";

type Toast = { id: string; content: ReactNode; loading: boolean; complete: boolean; completionText?: string | null; revision: number };
type Notifications = { messages: Toast[]; show: (id: string, content: ReactNode, loading: boolean, completionText?: string | null) => void; finish: (id: string) => void; dismiss: (id: string) => void };
const NotificationContext = createContext<Notifications | null>(null);
const lifetime = 1750;

function messageSignature(node: ReactNode): { text: string; loading: boolean } {
  let text = "", loading = false;
  Children.forEach(node, child => {
    if (typeof child === "string" || typeof child === "number") text += child;
    else if (isValidElement<{ children?: ReactNode }>(child)) {
      const nested = messageSignature(child.props.children);
      text += nested.text;
      loading ||= child.type === LoadingIndicator || nested.loading;
    }
  });
  return { text, loading };
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const active = useRef(new Map<string, boolean>());
  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id)); timers.current.delete(id);
    setMessages(current => current.filter(message => message.id !== id));
  }, []);
  const expire = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => dismiss(id), lifetime));
  }, [dismiss]);
  const show = useCallback((id: string, content: ReactNode, loading: boolean, completionText?: string | null) => {
    clearTimeout(timers.current.get(id)); timers.current.delete(id);
    active.current.set(id, loading);
    setMessages(current => {
      const previous = current.find(message => message.id === id);
      const next = { id, content, loading, complete: false, completionText, revision: (previous?.revision ?? 0) + 1 };
      return [...current.filter(message => message.id !== id), next];
    });
    if (!loading) expire(id);
  }, [expire]);
  const finish = useCallback((id: string) => {
    const loading = active.current.get(id); active.current.delete(id);
    if (!loading) return;
    setMessages(current => current.flatMap(message => message.id !== id ? [message] : message.completionText === null ? [] : [{ ...message, loading: false, complete: true, revision: message.revision + 1 }]));
    expire(id);
  }, [expire]);
  useEffect(() => { const pending = timers.current; return () => { pending.forEach(clearTimeout); pending.clear(); }; }, []);
  const value = useMemo(() => ({ messages, show, finish, dismiss }), [messages, show, finish, dismiss]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function NotificationMessage({ children, completionText }: { children: ReactNode; completionText?: string | null }) {
  const notifications = useContext(NotificationContext);
  const id = useId();
  const latest = useRef(children); latest.current = children;
  const { text, loading } = messageSignature(children);
  const show = notifications?.show, finish = notifications?.finish;
  useEffect(() => { show?.(id, latest.current, loading, completionText); }, [show, id, text, loading, completionText]);
  useEffect(() => () => finish?.(id), [finish, id]);
  return notifications ? null : <>{children}</>;
}

export function NotificationBar({ label, completedLabel = "Loading complete" }: { label: string; emptyLabel?: string; completedLabel?: string }) {
  const notifications = useContext(NotificationContext);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !notifications || !notifications.messages.length) return null;
  return createPortal(<aside className="notification-bar" aria-label={label} aria-live="polite" aria-relevant="additions text">
    {notifications.messages.map(message => <section key={message.id} className="notification-toast" role="status">
      <div className="notification-toast-content">{message.complete ? message.completionText || completedLabel : message.content}</div>
      <button type="button" className="notification-toast-dismiss" aria-label="Dismiss notification" onClick={() => notifications.dismiss(message.id)}>×</button>
      <div key={message.revision} className={`notification-countdown${message.loading ? " is-loading" : ""}`} aria-hidden="true"><span /></div>
    </section>)}
  </aside>, document.body);
}
