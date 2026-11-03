export function manualOrderNotification(input: { reference: string; product: string; amountToCollect: number | null; shippingRegion: "WEST" | "EAST"; language?: string }) {
  const malay = /^ms(?:-|$)/i.test(input.language || "");
  const amount = input.amountToCollect;
  const valid = amount !== null && Number.isFinite(amount) && amount >= (input.shippingRegion === "EAST" ? 20 : 0);
  const money = (value: number) => "RM" + value.toFixed(2).replace(/\.00$/, "");
  const total = valid ? money(amount!) : (malay ? "Harga belum tersedia" : "Price unavailable");
  const item = valid ? money(amount! - (input.shippingRegion === "EAST" ? 20 : 0)) : "";
  const summary = !valid ? "" : input.shippingRegion === "EAST"
    ? malay ? `Ini ringkasan pesanan anda\n${item} + RM20 (penghantaran Malaysia Timur)\nJumlah ialah ${total}` : `Here is your order summary\n${item} + RM20 (East Malaysia shipping)\nTotal is ${total}`
    : malay ? `Ini ringkasan pesanan anda\n${item} + RM8 (penghantaran)\nSaya beri anda penghantaran percuma\nJumlah ialah ${total}` : `Here is your order summary\n${item} + RM8 (shipping)\nI give you free shipping\nTotal is ${total}`;
  return { title: malay ? "Pesanan baharu" : "New Manual Order", body: `${input.reference}\n${input.product}\n${malay ? "Jumlah perlu dikutip" : "To collect"}: ${total}`, summary, language: malay ? "ms" : "en", total };
}
