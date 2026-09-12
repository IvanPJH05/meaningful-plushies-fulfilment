import { notFound } from "next/navigation";

import { DirectManualOrderPage, type LockedPlushie } from "@/components/direct-manual-order-page";

const links: Record<string, LockedPlushie> = {
  b5: { character: "Billy", productKey: "plushie_5s" }, b10: { character: "Billy", productKey: "plushie_10s" }, b20: { character: "Billy", productKey: "plushie_20s" },
  t5: { character: "Tootsie", productKey: "plushie_5s" }, t10: { character: "Tootsie", productKey: "plushie_10s" }, t20: { character: "Tootsie", productKey: "plushie_20s" },
  d5: { character: "Dragon Warrior", productKey: "plushie_5s" }, d10: { character: "Dragon Warrior", productKey: "plushie_10s" }, d20: { character: "Dragon Warrior", productKey: "plushie_20s" },
  h5: { character: "Hunnie", productKey: "plushie_5s" }, h10: { character: "Hunnie", productKey: "plushie_10s" }, h20: { character: "Hunnie", productKey: "plushie_20s" },
};

export default async function CollectionProxyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const lockedPlushie = links[code.toLowerCase()];
  if (!lockedPlushie) notFound();
  return <DirectManualOrderPage lockedPlushie={lockedPlushie} apiUrl="/apps/customise-your-plushie/manual-order" collectionCode={code} />;
}
