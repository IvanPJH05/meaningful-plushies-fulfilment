import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { context,failure,headers,PairingError } from "@/lib/certificate-cards-server";
import { matchesProductionBarcode } from "@/lib/production-tracking";
import { validatePackingCapture,packingSourceLimit } from "@/lib/packing-proof";
import { trimPackingVideo } from "@/lib/packing-proof-video";
import { trackingCode } from "@/lib/warehouse-packing";
export const runtime="nodejs";
export const preferredRegion="icn1";
export const maxDuration=120;
const bucketName="packing-proof";
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

export async function GET(request:Request) {
  try {
    const {client}=await context(request),orderId=new URL(request.url).searchParams.get("orderId");
    if(!orderId || orderId.length>200) throw new PairingError("Choose an order.");
    const {data,error}=await client.from("packing_proof_videos").select("id,order_id,card_code,status,scanned_at,error,created_at").eq("order_id",orderId).order("scanned_at",{ascending:false}).limit(30);
    if(error) throw error;
    return NextResponse.json({proofs:data},{headers});
  } catch(error) {return failure(error);}
}

export async function POST(request:Request) {
  let activeId:string|undefined,lease:string|undefined;
  const {client,actor}=await context(request).catch(()=>({client:null,actor:null}));
  if(!client || !actor) return NextResponse.json({error:"Sign in to an active staff account."},{status:401,headers});
  try {
    const raw=await request.text();
    if(raw.length>5000) throw new PairingError("Invalid packing video request.");
    const body=JSON.parse(raw);
    if(body.action==="prepare") {
      const capture=validatePackingCapture(body);
      if(body.packAfterSave!==undefined&&typeof body.packAfterSave!=="boolean")throw new PairingError("Invalid packing completion mode.");
      const packAfterSave=body.packAfterSave===true;
      if(capture.captureMode==="warehouse" && !packAfterSave)throw new PairingError("Warehouse packing requires a verified video before completion.");
      const sourcePath=`${capture.id}/source.${capture.contentType==="video/mp4"?"mp4":"webm"}`;
      const {data:existing,error:existingError}=await client.from("packing_proof_videos").select("*").eq("id",capture.id).maybeSingle();
      if(existingError) throw existingError;
      if(existing) {
        if((existing.capture_mode||"timed")!==(capture.captureMode||"timed") || (capture.captureMode==="warehouse" && (existing.duration_ms!==capture.durationMs || existing.tracking_number!==capture.trackingNumber || Date.parse(existing.tracking_verified_at)!==Date.parse(capture.trackingVerifiedAt!))) || existing.pack_after_save!==packAfterSave || existing.order_id!==capture.orderId || existing.card_code!==capture.cardCode || existing.order_barcode!==capture.orderBarcode || Date.parse(existing.scanned_at)!==Date.parse(capture.scannedAt) || existing.source_size!==capture.size || existing.source_type!==capture.contentType || Date.parse(existing.source_started_at)!==Date.parse(capture.sourceStartedAt)) throw new PairingError("This video reference belongs to a different recording.");
        if(existing.status==="ready") return NextResponse.json({ready:true,packed:existing.pack_after_save},{headers});
      } else {
        const {data:order,error}=await client.from("fulfilment_orders").select("id,order_number,trackingNumber:data->>trackingNumber").eq("id",capture.orderId).maybeSingle();
        if(error || !order || !matchesProductionBarcode({id:order.id,orderNumber:order.order_number},capture.orderBarcode)) throw new PairingError("The packing barcode does not match this order.");
        if(capture.captureMode==="warehouse" && (!trackingCode(order.trackingNumber) || trackingCode(order.trackingNumber)!==capture.trackingNumber)) throw new PairingError("The shipping-label barcode does not match the order's current tracking number. Scan the correct label again.");
        const pair=capture.cardCode.startsWith("NFC-")
          ? await client.from("nfc_cards").select("id").eq("id",Number(capture.cardCode.slice(4))).eq("order_id",capture.orderId).eq("status","assigned").maybeSingle()
          : await client.from("bc_v2_certificates").select("code").eq("order_ref",capture.orderId).eq("item_key",capture.orderId).eq("code",capture.cardCode).eq("status","active").maybeSingle();
        if(pair.error || !pair.data) throw new PairingError("Pair this order with its matching ID card before saving the video.");
        const saved=await client.from("packing_proof_videos").insert({id:capture.id,order_id:capture.orderId,card_code:capture.cardCode,order_barcode:capture.orderBarcode,scanned_at:capture.scannedAt,source_started_at:capture.sourceStartedAt,offset_ms:capture.offsetMs,source_path:sourcePath,source_size:capture.size,source_type:capture.contentType,created_by:actor,pack_after_save:packAfterSave,...(capture.captureMode==="warehouse"?{capture_mode:"warehouse",duration_ms:capture.durationMs,tracking_number:capture.trackingNumber,tracking_verified_at:capture.trackingVerifiedAt}:{})});
        if(saved.error) throw saved.error;
      }
      const storage=client.storage.from(bucketName),info=await storage.info(sourcePath);
      if(!info.error && info.data?.size===capture.size) return NextResponse.json({uploaded:true},{headers});
      const signed=await storage.createSignedUploadUrl(sourcePath,{upsert:false});
      if(signed.error) throw signed.error;
      return NextResponse.json({signedUrl:signed.data.signedUrl},{headers});
    }
    if(typeof body.id!=="string" || !uuid.test(body.id)) throw new PairingError("Choose a packing video.");
    const {data:proof,error}=await client.from("packing_proof_videos").select("*").eq("id",body.id).single();
    if(error || !proof) throw new PairingError("Packing video not found.");
    const storage=client.storage.from(bucketName);
    if(body.action==="preview") {
      if(proof.status!=="ready" || !proof.video_path) throw new PairingError("The video is still being saved.");
      const signed=await storage.createSignedUrl(proof.video_path,600);
      if(signed.error) throw signed.error;
      return NextResponse.json({url:signed.data.signedUrl},{headers});
    }
    if(body.action!=="complete") throw new PairingError("Choose a valid video action.");
    if(proof.status==="ready") return NextResponse.json({ready:true,packed:proof.pack_after_save},{headers});
    lease=randomUUID();activeId=proof.id;
    const acquired=await client.from("packing_proof_videos").update({status:"processing",processing_token:lease,lease_until:new Date(Date.now()+240000).toISOString(),error:""}).eq("id",proof.id).or(`status.in.(uploading,failed),lease_until.lt.${new Date().toISOString()}`).select("id").maybeSingle();
    if(acquired.error) throw acquired.error;
    if(!acquired.data) return NextResponse.json({processing:true},{headers});
    const info=await storage.info(proof.source_path);
    if(info.error || Number(info.data?.size)!==proof.source_size || Number(info.data?.size)>packingSourceLimit || info.data?.contentType?.split(";")[0]!==proof.source_type) throw new Error("The camera video upload is incomplete. Retry saving it.");
    const source=await storage.download(proof.source_path);
    if(source.error || source.data.size!==proof.source_size) throw new Error("The camera video upload is incomplete. Retry saving it.");
    const bytes=await trimPackingVideo(Buffer.from(await source.data.arrayBuffer()),proof.offset_ms,proof.capture_mode==="warehouse"?proof.duration_ms:undefined);
    const videoPath=`${proof.id}/proof.mp4`;
    const uploaded=await storage.upload(videoPath,bytes,{contentType:"video/mp4",upsert:true});
    if(uploaded.error) throw new Error("Could not save the packing video. Please retry.");
    const verified=await storage.info(videoPath);
    if(verified.error || verified.data.size!==bytes.length) throw new Error("The saved video could not be verified. Please retry.");
    if(proof.pack_after_save){
      const saved=await client.rpc("packing_station_complete",{p_actor:actor,p_proof:proof.id,p_lease:lease,p_path:videoPath,p_size:bytes.length});
      if(saved.error)throw new Error(saved.error.message);
    }else{
      const saved=await client.from("packing_proof_videos").update({status:"ready",video_path:videoPath,video_size:bytes.length,saved_at:new Date().toISOString(),lease_until:null,error:""}).eq("id",proof.id).eq("processing_token",lease).select("id").maybeSingle();
      if(saved.error || !saved.data) throw new Error("The recording changed while saving. Please retry.");
    }
    await storage.remove([proof.source_path]);
    return NextResponse.json({ready:true,packed:proof.pack_after_save},{headers});
  } catch(error) {
    if(activeId && lease) await client.from("packing_proof_videos").update({status:"failed",error:error instanceof Error?error.message.slice(0,250):"Saving failed. Please retry.",lease_until:null}).eq("id",activeId).eq("processing_token",lease).neq("status","ready");
    return failure(error);
  }
}
