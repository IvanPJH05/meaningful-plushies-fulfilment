import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(__dirname),
  // Shopify forwards the root app-proxy URL with a trailing slash. Preserve it
  // instead of sending Shopify an internal redirect that becomes a storefront 404.
  skipTrailingSlashRedirect: true,
  // App proxy HTML is served from Shopify's domain. Load its Next assets from
  // the app host while keeping the customer-facing URL on the Shopify domain.
  assetPrefix: process.env.NEXT_PUBLIC_APP_URL || "https://meaningful-plushies-fulfilment.vercel.app",
};

export default nextConfig;
