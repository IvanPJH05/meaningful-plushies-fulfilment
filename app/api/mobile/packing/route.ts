import {NextResponse} from "next/server";
import {context,failure,headers,PairingError,summary} from "@/lib/certificate-cards-server";
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
        client.from("packing_proof_videos").select("id,pack_after_save").limit(1),
        client.storage.getBucket("packing-proof"),
      ]);
      if(orders.error||proofs.error||bucket.error)throw new PairingError("The packing service is not ready. Contact the administrator.",503);
      if(!bucket.data||bucket.data.public||Number(bucket.data.file_size_limit)<25*1024*1024)throw new PairingError("Private packing video storage is not ready.",503);
      return NextResponse.json({connected:true,protocol:2,packingRequiresSavedVideo:true,staff:{displayName:session.displayName,username:session.username},recording:{beforeSeconds:3,afterSeconds:20},checkedAt:new Date().toISOString()},{headers});
    }
    const scan=packingBarcodeQuery(barcode),query=client.from("fulfilment_orders").select(packingOrderProjection);
    const result=scan.kind==="id"?await query.ilike("id",scan.value).limit(2)
      :scan.kind==="tiktok"?await query.ilike("order_number",scan.value+" %").limit(20)
      :await query.or("id.ilike."+scan.value+",order_number.ilike."+scan.value).limit(20);
    if(result.error)throw result.error;
    return NextResponse.json({item:packingOrderItem(result.data||[],scan.code)},{headers});
  }catch(error){return failure(error);}
}

export async function POST(request:Request){
  try{
    const {client,actor}=await context(request);const raw=await request.text();if(raw.length>5000)throw new PairingError("Invalid packing request.");const body=JSON.parse(raw);
    if(body.action!=="pair"||typeof body.orderId!=="string"||!body.orderId||body.orderId.length>200||typeof body.orderBarcode!=="string"||body.orderBarcode.length>512)throw new PairingError("Scan the order and its matching ID card.");
    const card=String(body.cardCode||"").trim().toUpperCase();if(!/^(NFC-\d{6,12}|\d{6})$/.test(card))throw new PairingError("Scan a valid NFC card barcode.");
    let details=null;if(!card.startsWith("NFC-")){const {data,error}=await client.from("fulfilment_orders").select("id,order_number,updated_at,data").eq("id",body.orderId).single();if(error||!data)throw new PairingError("Order not found.");details=summary(data as Parameters<typeof summary>[0]).fields;}
    const paired=await client.rpc("packing_station_pair",{p_actor:actor,p_order:body.orderId,p_barcode:body.orderBarcode,p_card:card,p_details:details});
    if(paired.error)throw new PairingError(paired.error.message,409);return NextResponse.json({ok:true,paired:true,packed:false},{headers});
  }catch(error){return failure(error);}
}
