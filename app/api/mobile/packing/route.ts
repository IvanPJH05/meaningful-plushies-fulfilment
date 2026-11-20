import {NextResponse} from "next/server";
import {context,failure,headers,PairingError} from "@/lib/certificate-cards-server";
import {packingBarcodeQuery,packingOrderItem,packingOrderProjection} from "@/lib/packing-station";
export const runtime="nodejs";
export const preferredRegion="icn1";

export async function GET(request:Request){
  try{
    const {client,session}=await context(request);
    const barcode=new URL(request.url).searchParams.get("scanBarcode");
    if(barcode===null){
      const [orders,proofs,bucket]=await Promise.all([
        client.from("fulfilment_orders").select("id").limit(1),
        client.from("packing_proof_videos").select("id").limit(1),
        client.storage.getBucket("packing-proof"),
      ]);
      if(orders.error||proofs.error||bucket.error)throw new PairingError("The packing service is not ready. Contact the administrator.",503);
      if(!bucket.data||bucket.data.public||Number(bucket.data.file_size_limit)<25*1024*1024)throw new PairingError("Private packing video storage is not ready.",503);
      return NextResponse.json({connected:true,protocol:1,staff:{displayName:session.displayName,username:session.username},recording:{beforeSeconds:3,afterSeconds:20},checkedAt:new Date().toISOString()},{headers});
    }
    const scan=packingBarcodeQuery(barcode),query=client.from("fulfilment_orders").select(packingOrderProjection);
    const result=scan.kind==="id"?await query.ilike("id",scan.value).limit(2)
      :scan.kind==="tiktok"?await query.ilike("order_number",scan.value+" %").limit(20)
      :await query.or("id.ilike."+scan.value+",order_number.ilike."+scan.value).limit(20);
    if(result.error)throw result.error;
    return NextResponse.json({item:packingOrderItem(result.data||[],scan.code)},{headers});
  }catch(error){return failure(error);}
}
