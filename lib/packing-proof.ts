export const packingBeforeMs = 3_000;
export const packingAfterMs = 20_000;
export const packingWindowMs = 65_000;
export const packingWindowStepMs = 20_000;
export const packingSourceLimit = 200 * 1024 * 1024;
import { trackingCode, warehouseMaxDurationMs } from "./warehouse-packing.ts";
export type PackingCapture = { id: string; orderId: string; orderNumber: string; orderBarcode: string; cardCode: string; scannedAt: string; sourceStartedAt: string; size: number; contentType: string; captureMode?: "warehouse"; durationMs?: number; trackingNumber?: string; trackingVerifiedAt?: string; packAfterSave?: boolean };
export type PackingProofRow = { id: string; order_id: string; card_code: string; status: "uploading" | "processing" | "ready" | "failed"; scanned_at: string; error: string; created_at: string };

export function packingWindow<T extends { startedAt: number; failed: boolean }>(windows: T[], at: number): T | undefined {
  return windows.filter(w => !w.failed && w.startedAt <= at - packingBeforeMs && w.startedAt + packingWindowMs >= at + packingAfterMs + 500)
    .sort((a,b) => b.startedAt-a.startedAt)[0];
}

export function validatePackingCapture(raw: Record<string,unknown>, now = Date.now()): PackingCapture & { offsetMs: number } {
  const string = (key: string, max: number) => {
    if (typeof raw[key] !== "string" || !raw[key] || (raw[key] as string).length > max) throw new Error("Invalid packing video details.");
    return raw[key] as string;
  };
  const id=string("id",36),orderId=string("orderId",200),orderNumber=typeof raw.orderNumber === "string" ? raw.orderNumber.slice(0,200) : "";
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) throw new Error("Invalid packing video reference.");
  const orderBarcode=string("orderBarcode",512),cardCode=string("cardCode",32);
  if (!/^(NFC-\d{6,12}|\d{6})$/.test(cardCode)) throw new Error("Scan the matching ID card first.");
  const scannedAt=string("scannedAt",40),sourceStartedAt=string("sourceStartedAt",40);
  const scan=Date.parse(scannedAt),start=Date.parse(sourceStartedAt),offsetMs=scan-start-packingBeforeMs;
  if (raw.captureMode !== undefined && raw.captureMode !== "warehouse") throw new Error("Invalid recording mode.");
  if (raw.captureMode === "warehouse") {
    const durationMs=Number(raw.durationMs),trackingNumber=trackingCode(raw.trackingNumber),verified=Date.parse(String(raw.trackingVerifiedAt||""));
    const size=Number(raw.size),contentType=String(raw.contentType||"").split(";")[0];
    if (!Number.isFinite(start)||!Number.isFinite(scan)||Math.abs(scan-start)>1000||start>now+60000||start<now-7*86400000||!Number.isInteger(durationMs)||durationMs<1000||durationMs>warehouseMaxDurationMs||!trackingNumber||!Number.isFinite(verified)||verified<start||verified>start+durationMs+2000||verified>now+60000) throw new Error("A complete recording and matching shipping-label scan are required.");
    if (!Number.isInteger(size)||size<=0||size>packingSourceLimit||!["video/webm","video/mp4"].includes(contentType)) throw new Error("The packing recording is empty, too large, or unsupported.");
    return {id,orderId,orderNumber,orderBarcode,cardCode,scannedAt:new Date(scan).toISOString(),sourceStartedAt:new Date(start).toISOString(),size,contentType,offsetMs:0,captureMode:"warehouse" as const,durationMs,trackingNumber,trackingVerifiedAt:new Date(verified).toISOString()};
  }
  if (!Number.isFinite(scan) || !Number.isFinite(start) || scan>now+60_000 || scan<now-7*86400000 || offsetMs<0 || offsetMs>packingWindowStepMs+1000) throw new Error("A complete 3-second camera history is required. Restart the webcam and scan again.");
  const size=Number(raw.size),contentType=String(raw.contentType||"").split(";")[0];
  if (!Number.isInteger(size) || size<=0 || size>packingSourceLimit || !["video/webm","video/mp4"].includes(contentType)) throw new Error("The packing recording is empty, too large, or unsupported.");
  return {id,orderId,orderNumber,orderBarcode,cardCode,scannedAt:new Date(scan).toISOString(),sourceStartedAt:new Date(start).toISOString(),size,contentType,offsetMs};
}
