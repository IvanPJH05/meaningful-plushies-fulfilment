import type { ReactNode } from "react";

// CSS animation only: no timers, polling, or data requests.
export function LoadingIndicator({ children }: { children: ReactNode }) {
  return <span className="loading-indicator" role="status"><span className="loading-spinner" aria-hidden="true" /><span>{children}</span></span>;
}
