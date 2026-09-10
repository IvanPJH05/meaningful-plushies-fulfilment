import { Suspense } from "react";

import { CloserCustomerPage } from "@/components/closer-customer-page";

export default function CloserProxyPage() {
  return <Suspense fallback={<main className="closer-page-loading">Opening your shared space…</main>}><CloserCustomerPage proxyPath="/apps/closer" /></Suspense>;
}
