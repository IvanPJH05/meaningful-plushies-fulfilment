import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mobileServiceClient, requireMobileSession } from "../../../../../../lib/mobile-api";
export async function POST(request: Request) {
 try {
  await requireMobileSession(request);
  const {fileName,contentType,size}=await request.json();
  if(typeof fileName!=="string" || !fileName || fileName.length>255 || typeof contentType!=="string" || !/^(audio\/|video\/|image\/|text\/plain$|application\/(pdf|octet-stream|msword|vnd.openxmlformats-officedocument.wordprocessingml.document)$)/i.test(contentType) || !Number.isSafeInteger(size) || size<1 || size>50*1024*1024) return NextResponse.json({error:"Choose an attachment up to 50 MB."},{status:400});
  const safeName=fileName.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-80);
  const path=`${randomUUID()}/${randomUUID()}-${safeName}`;
  const {data,error}=await mobileServiceClient().storage.from("customisation-audio").createSignedUploadUrl(path);
  if(error || !data) throw new Error("Could not prepare attachment upload.");
  return NextResponse.json({signedUrl:data.signedUrl,path},{headers:{"Cache-Control":"no-store"}});
 } catch(error) {
  const message=error instanceof Error?error.message:"Attachment upload failed.";
  return NextResponse.json({error:message},{status:message==="SIGN_IN_REQUIRED"?401:message==="WAREHOUSE_ACCESS_REQUIRED"?403:500});
 }
}
