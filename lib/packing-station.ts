import { matchesProductionBarcode } from "./production-tracking";

// Extract only scalar packing fields in Postgres. Voice and label attachments
// can be tens of megabytes and must never enter a scanner lookup response.
export const packingOrderProjection = "id,order_number,status,updated_at,customerName:data->>customerName,plushName:data->>plushName,character:data->>character,product:data->>product,courier:data->>courier,trackingNumber:data->>trackingNumber,voiceLength:data->>voiceLength";
export function packingBarcodeQuery(raw: string) {
  const code=raw.trim().toUpperCase();
  if(!code || code.length>200)throw new Error("Scan an individual order barcode.");
  const individual=code.startsWith("MPI-");
  const value=individual?code.slice(4):code.replace(/^MP-?/,"").replace(/^#/,"");
  if(!/^[A-Z0-9 -]{1,160}$/.test(value))throw new Error("Scan an individual order barcode.");
  return {code,value,kind:individual?"id":/^TT\d+$/.test(value)?"tiktok":"exact"} as const;
}
export function packingOrderItem(rows:Record<string,unknown>[],barcode:string) {
  const matches=rows.filter(row=>matchesProductionBarcode({id:row.id,orderNumber:row.order_number},barcode));
  if(matches.length>1)throw new Error("This code matches multiple items. Scan the individual packing slip barcode.");
  const row=matches[0];if(!row)return null;
  const scalar=(key:string)=>typeof row[key]==="string"?(row[key] as string).slice(0,500):"";
  return {order_id:scalar("id"),order:{id:scalar("id"),orderNumber:scalar("order_number"),status:scalar("status"),updatedAt:scalar("updated_at"),customerName:scalar("customerName"),plushName:scalar("plushName"),character:scalar("character"),product:scalar("product"),courier:scalar("courier"),trackingNumber:scalar("trackingNumber"),voiceLength:Number(row.voiceLength)||0}};
}
