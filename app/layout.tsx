
import type { Metadata } from "next";
import "./globals.css";
import "./packing.css";
import "./fulfilment.css";
import "./dashboard-upgrades.css";

export const metadata: Metadata = {
  title: "Meaningful Plushies Fulfilment",
  description: "Order production and fulfilment workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

