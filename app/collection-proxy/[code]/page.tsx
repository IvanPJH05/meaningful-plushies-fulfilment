import { notFound } from "next/navigation";

import { DirectManualOrderPage, type LockedPlushie } from "@/components/direct-manual-order-page";

type CollectionLink = LockedPlushie & { videoUrl: string };

const links: Record<string, CollectionLink> = {
  b5: { character: "Billy", productKey: "plushie_5s", videoUrl: "/apps/customise-your-plushie/order-summaries/b5.mp4" }, b10: { character: "Billy", productKey: "plushie_10s", videoUrl: "/apps/customise-your-plushie/order-summaries/b10.mp4" }, b20: { character: "Billy", productKey: "plushie_20s", videoUrl: "/apps/customise-your-plushie/order-summaries/b20.mp4" },
  t5: { character: "Tootsie", productKey: "plushie_5s", videoUrl: "/apps/customise-your-plushie/order-summaries/t5.mp4" }, t10: { character: "Tootsie", productKey: "plushie_10s", videoUrl: "/apps/customise-your-plushie/order-summaries/t10.mp4" }, t20: { character: "Tootsie", productKey: "plushie_20s", videoUrl: "/apps/customise-your-plushie/order-summaries/t20.mp4" },
  d5: { character: "Dragon Warrior", productKey: "plushie_5s", videoUrl: "/apps/customise-your-plushie/order-summaries/d5.mp4" }, d10: { character: "Dragon Warrior", productKey: "plushie_10s", videoUrl: "/apps/customise-your-plushie/order-summaries/d10.mp4" }, d20: { character: "Dragon Warrior", productKey: "plushie_20s", videoUrl: "/apps/customise-your-plushie/order-summaries/d20.mp4" },
  h5: { character: "Hunnie", productKey: "plushie_5s", videoUrl: "/apps/customise-your-plushie/order-summaries/h5.mp4" }, h10: { character: "Hunnie", productKey: "plushie_10s", videoUrl: "/apps/customise-your-plushie/order-summaries/h10.mp4" }, h20: { character: "Hunnie", productKey: "plushie_20s", videoUrl: "/apps/customise-your-plushie/order-summaries/h20.mp4" },
};

export default async function CollectionProxyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const lockedPlushie = links[code.toLowerCase()];
  if (!lockedPlushie) notFound();
  return <DirectManualOrderPage lockedPlushie={lockedPlushie} apiUrl="/apps/customise-your-plushie/manual-order" collectionCode={code} orderSummaryVideo={lockedPlushie.videoUrl} />;
}
