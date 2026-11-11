import { notFound } from "next/navigation";

import { DirectPlushCharmCollectionPage } from "@/components/direct-plush-charm-collection-page";
import { shopifyProductVideoForHandle } from "@/lib/shopify-product-video";

const charms = {
  p5: { character: "Penny", productKey: "plush_charm_penny_5s", seconds: 5, handle: "p-5-meaningful-plush-charm" },
  p10: { character: "Penny", productKey: "plush_charm_penny_10s", seconds: 10, handle: "p-10s-meaningful-plush-charm-copy" },
  p20: { character: "Penny", productKey: "plush_charm_penny_20s", seconds: 20, handle: "p-20s-meaningful-plush-charm" },
  r5: { character: "Renny", productKey: "plush_charm_renny_5s", seconds: 5, handle: "r-5s-meaningful-plush-charm" },
  r10: { character: "Renny", productKey: "plush_charm_renny_10s", seconds: 10, handle: "r-10s-meaningful-plush-charm" },
  r20: { character: "Renny", productKey: "plush_charm_renny_20s", seconds: 20, handle: "r-20s-meaningful-plush-charm" },
  b5: { character: "Benny", productKey: "plush_charm_benny_5s", seconds: 5, handle: "b-20s-meaningful-plush-charm" },
  b10: { character: "Benny", productKey: "plush_charm_benny_10s", seconds: 10, handle: "b-10s-meaningful-plush-charm" },
  b20: { character: "Benny", productKey: "plush_charm_benny_20s", seconds: 20, handle: "b-20s-meaningful-plush-charm-1" },
} as const;

export default async function PlushCharmCollectionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const charm = charms[code.toLowerCase() as keyof typeof charms];
  if (!charm) notFound();
  const videoUrl = await shopifyProductVideoForHandle(charm.handle).catch(() => "");
  return <DirectPlushCharmCollectionPage charm={charm} collectionCode={`charm-${code.toLowerCase()}`} orderSummaryVideo={videoUrl} />;
}
