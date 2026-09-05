import { Suspense } from "react";

import { CloserCustomerPage } from "@/components/closer-customer-page";

export default function CloserPage() {
  return <Suspense fallback={<main className="closer-page-loading">Opening your shared space…</main>}><CloserCustomerPage /></Suspense>;
}
