import {mobileServiceClient} from './mobile-api';
import {ugcSubmissionSession,startUgcSubmission} from './ugc-submissions';
import {ugcCustomerDetails} from './ugc-submission-validation';

export const originalVideoLimit=500*1024**3;
export const originalConsent={en:'I confirm this is my own content and I have permission from everyone shown. I allow Meaningful Plushies to use, edit, publish and reuse my videos and raw footage for marketing on its website, social media and paid advertising.',ms:'Saya mengesahkan bahawa ini ialah kandungan saya sendiri dan saya mendapat kebenaran daripada semua orang yang dipaparkan. Saya membenarkan Meaningful Plushies menggunakan, menyunting, menerbitkan dan menggunakan semula video serta rakaman asal saya untuk pemasaran di laman web, media sosial dan iklan berbayar.'};
export function originalVideoType(name:string,type:string,size:number){
 const mime:Record<string,string>={mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'};
 const expected=mime[name.split('.').pop()?.toLowerCase()||''];
 if(!name||name.length>200||/[\x00-\x1f]/.test(name)||!expected||(type&&type!==expected)||!Number.isSafeInteger(size)||size<=0||size>originalVideoLimit)throw new Error('Choose an original MP4, MOV or WebM video, up to 500 GB per file.');
 return expected;
}
const videoId=(value:unknown)=>{const id=String(value||'');if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw new Error('Invalid video.');return id;};
export async function originalSubmission(body:Record<string,unknown>,client:string){
 if(body.action==='start')return {...await startUgcSubmission(client),fileSizeLimit:originalVideoLimit};
 const parent=await ugcSubmissionSession(String(body.token||'')),db=mobileServiceClient();
 if(body.action==='submit'){
  const details={...ugcCustomerDetails(body),consent_text:originalConsent[body.language==='ms'?'ms':'en']};
  const result=await db.rpc('finish_ugc_original_submission',{p_submission:parent.id,p_details:details});
  if(result.error)throw result.error;
  return {reference:result.data};
 }
 if(parent.status!=='draft')throw new Error('This submission has already been sent.');
 const id=videoId(body.fileId);
 if(body.action==='upload'){
  const name=typeof body.fileName==='string'?body.fileName:'',size=Number(body.size),type=originalVideoType(name,String(body.contentType||''),size);
  const reserved=await db.rpc('manage_ugc_video',{p_submission:parent.id,p_id:id,p_action:'reserve',p_name:name,p_type:type,p_size:size});
  if(reserved.error)throw reserved.error;
  const file=reserved.data;
  if(file.status==='complete')return {alreadyUploaded:true,fileId:id};
  // A disconnect can happen after storage saved the original but before the
  // completion request reached us. Recover it without uploading/overwriting it.
  const existing=await db.storage.from('customer-ugc').info(file.storage_path);
  if(!existing.error&&existing.data){
   if(Number(existing.data.size??existing.data.metadata?.size)!==Number(file.file_size)||(existing.data.contentType??existing.data.metadata?.mimetype)!==file.content_type)throw new Error('This uploaded file does not match the original. Remove it and choose the original again.');
   const completed=await db.rpc('manage_ugc_video',{p_submission:parent.id,p_id:id,p_action:'complete'});
   if(completed.error)throw completed.error;
   return {alreadyUploaded:true,fileId:id};
  }
  const signed=await db.storage.from('customer-ugc').createSignedUploadUrl(file.storage_path);
  if(signed.error)throw signed.error;
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://joaoirpegnkexmktylop.supabase.co';
  const endpoint=new URL(base);endpoint.hostname=endpoint.hostname.replace('.supabase.co','.storage.supabase.co');endpoint.pathname='/storage/v1/upload/resumable/sign';
  return {fileId:id,path:file.storage_path,uploadToken:signed.data.token,endpoint:endpoint.href,contentType:type,bucket:'customer-ugc'};
 }
 if(!['complete','remove'].includes(String(body.action)))throw new Error('Invalid submission action.');
 const saved=await db.from('marketing_ugc_submission_videos').select('*').eq('submission_id',parent.id).eq('id',id).single();
 if(saved.error||!saved.data||saved.data.status==='removed')throw new Error('Video not found.');
 if(body.action==='complete'){
  const info=await db.storage.from('customer-ugc').info(saved.data.storage_path);
  if(info.error||Number(info.data?.size??info.data?.metadata?.size)!==Number(saved.data.file_size)||(info.data?.contentType??info.data?.metadata?.mimetype)!==saved.data.content_type)throw new Error('Your video upload is incomplete. Please retry.');
 }
 const result=await db.rpc('manage_ugc_video',{p_submission:parent.id,p_id:id,p_action:body.action});
 if(result.error)throw result.error;
 if(body.action==='remove'){
  const removed=await db.storage.from('customer-ugc').remove([saved.data.storage_path]);
  if(removed.error)throw removed.error;
 }
 return {ok:true,fileId:id};
}
