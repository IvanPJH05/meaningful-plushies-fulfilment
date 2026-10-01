import { NextResponse } from "next/server";
import { buildSalesReportRows, summarizeSales } from "../../../../lib/sales";
import { mobileServiceClient, requireMobileSession } from "../../../../lib/mobile-api";
import type { ManualOrder, Order, PaymentProcessorSetting } from "../../../../lib/types";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => typeof row[key] === "string" ? row[key] : "";
const numeric = (row: Row, key: string) => Number.isFinite(Number(row[key])) ? Number(row[key]) : 0;
const dateKey = (value: string) => value.slice(0, 10);

function reportOrder(row: Row): Order {
  return {
    id: text(row, "id"), orderNumber: text(row, "orderNumber") || text(row, "order_number"), orderDate: text(row, "orderDate"),
    salesChannel: text(row, "salesChannel") === "tiktok" ? "tiktok" : "shopify", customerName: text(row, "customerName"), phone: "", email: "", address: "", currency: "MYR",
    subtotalAmount: numeric(row, "subtotalAmount"), shippingAmount: numeric(row, "shippingAmount"), totalAmount: numeric(row, "totalAmount"), discountAmount: numeric(row, "discountAmount"), productDiscountAmount: numeric(row, "productDiscountAmount"), shippingDiscountAmount: numeric(row, "shippingDiscountAmount"), refundedAmount: numeric(row, "refundedAmount"), outstandingBalance: numeric(row, "outstandingBalance"), paymentProcessor: text(row, "paymentProcessor"), product: "", character: text(row, "character"), setIndicator: "", idWebsiteLink: "", voiceLength: numeric(row, "voiceLength"), plushName: "", certificateCode: "", meaningfulNote: "", meaningfulMessage: "", remark: "", voiceUploadStatus: "missing", courier: "", trackingNumber: "", status: "new_order", internalNotes: "", statusHistory: [], importedAt: text(row, "updated_at"), updatedAt: text(row, "updated_at"),
  };
}

export async function GET(request: Request) {
  try {
    const session = await requireMobileSession(request);
    if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
    const url = new URL(request.url);
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const source = url.searchParams.get("source") === "tiktok" ? "tiktok" : url.searchParams.get("source") === "shopify" ? "shopify" : "all";
    const client = mobileServiceClient();
    const [{ data, error }, { data: processors, error: processorsError }, { data: fee, error: feeError }, { data: manual, error: manualError }] = await Promise.all([
      client.from("fulfilment_orders").select("id,order_number,updated_at,orderNumber:data->>orderNumber,orderDate:data->>orderDate,salesChannel:data->>salesChannel,customerName:data->>customerName,character:data->>character,voiceLength:data->>voiceLength,subtotalAmount:data->>subtotalAmount,shippingAmount:data->>shippingAmount,totalAmount:data->>totalAmount,discountAmount:data->>discountAmount,productDiscountAmount:data->>productDiscountAmount,shippingDiscountAmount:data->>shippingDiscountAmount,refundedAmount:data->>refundedAmount,outstandingBalance:data->>outstandingBalance,paymentProcessor:data->>paymentProcessor").limit(5000),
      client.from("payment_processor_settings").select("processor,percentage,fixed_amount"),
      client.from("sales_fee_settings").select("shopify_percentage").eq("id", "default").maybeSingle(),
      client.from("manual_orders").select("id,shipping_region,is_cod,product_discount_code,shipping_discount_code,shopify_order_id,shopify_order_name"),
    ]);
    if (error) throw error; if (processorsError) throw processorsError; if (feeError) throw feeError; if (manualError) throw manualError;
    const unique = new Map<string, Order>();
    for (const row of (data ?? []) as Row[]) {
      const order = reportOrder(row);
      const orderDate = dateKey(order.orderDate);
      if ((from && orderDate < from) || (to && orderDate > to) || (source !== "all" && order.salesChannel !== source)) continue;
      const key = `${order.salesChannel}:${order.orderNumber}`;
      if (!unique.has(key)) unique.set(key, order);
    }
    const manualOrders = (manual ?? []).map((row) => ({ id: String(row.id || ""), customerName: "", phoneOriginal: "", phoneNormalized: "", phoneLastFour: "", productKey: "", productDisplayName: "", shopifyProductId: "", shopifyVariantId: "", productPath: "", shippingRegion: row.shipping_region === "EAST" ? "EAST" : "WEST", isCod: row.is_cod === true, productDiscountCode: String(row.product_discount_code || ""), productDiscountShopifyId: "", shippingDiscountCode: String(row.shipping_discount_code || ""), shippingDiscountShopifyId: "", customerLink: "", status: "used", shopifyOrderId: String(row.shopify_order_id || ""), shopifyOrderName: String(row.shopify_order_name || ""), createdAt: "", updatedAt: "", usedAt: "", paymentReceipts: [] } as ManualOrder));
    const processorSettings = (processors ?? []).map((row) => ({ processor: String(row.processor || ""), percentage: Number(row.percentage || 0), fixedAmount: Number(row.fixed_amount || 0) } as PaymentProcessorSetting));
    const orders = [...unique.values()];
    const rows = buildSalesReportRows(orders, processorSettings, Number(fee?.shopify_percentage || 0), manualOrders);
    const sales = summarizeSales(orders, processorSettings, Number(fee?.shopify_percentage || 0), manualOrders);
    const channel = rows.reduce((all, row) => { const isTikTok = orders.find((order) => order.orderNumber === row.orderNumber)?.salesChannel === "tiktok"; const key = isTikTok ? "tiktok" : "shopify"; all[key].count += 1; all[key].sales += row.salePrice; return all; }, { shopify: { count: 0, sales: 0 }, tiktok: { count: 0, sales: 0 } });
    return NextResponse.json({ sales, channel, orderCount: rows.length, from, to }, { headers: { "cache-control": "no-store, max-age=0" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "REPORT_FAILED" }, { status: 500 }); }
}
