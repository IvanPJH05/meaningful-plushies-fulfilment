import type { Order } from "./types";
// Upload binary media directly to Storage rather than through the order-save request.
export async function prepareImportAttachments(order: Order, token: string): Promise<Order> {
 if(!order.tikTokFileDataUrl?.startsWith("data:")) return order;
 const source=order.tikTokFileDataUrl;
 const blob=await (await fetch(source)).blob();
 const contentType=blob.type || order.tikTokFileType || "application/octet-stream";
 if(blob.size>50*1024*1024) throw new Error(`Order ${order.orderNumber}: attachment must be 50 MB or smaller.`);
 const signed=await fetch("/api/fulfilment/orders/import/attachment",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({fileName:order.tikTokFileName || "voice-audio",contentType,size:blob.size})});
 const result=await signed.json().catch(()=>({}));
 if(!signed.ok || !result.signedUrl || !result.path) throw new Error(result.error || `Order ${order.orderNumber}: could not prepare attachment upload.`);
 const form=new FormData();form.append("cacheControl","3600");form.append("",blob);
 const uploaded=await fetch(result.signedUrl,{method:"PUT",body:form});
 if(!uploaded.ok) {const failure=await uploaded.json().catch(()=>({}));throw new Error(failure.message || failure.error || `Order ${order.orderNumber}: attachment upload failed. Please retry.`);}
 return {...order,tikTokFileDataUrl:`supabase-storage:${result.path}`};
}
