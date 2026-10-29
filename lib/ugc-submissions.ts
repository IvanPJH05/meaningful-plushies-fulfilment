import {createHash,randomBytes} from 'node:crypto';
import {mobileServiceClient} from './mobile-api';
import {ugcCustomerDetails,ugcVideoLimit,ugcVideoType} from './ugc-submission-validation';
export const ugcHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function ugcSubmissionSession(token:string) {
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Your submission session expired. Reload and try again.');
  const {data,error}=await mobileServiceClient().from('marketing_ugc_submissions').select('*').eq('token_hash',ugcHash(token)).gt('created_at',new Date(Date.now()-86400000).toISOString()).single();
  if(error||!data)throw new Error('Your submission session expired. Reload and try again.');
  return data;
}
export async function startUgcSubmission(client:string) {
  const token=randomBytes(32).toString('hex');
  const {data,error}=await mobileServiceClient().rpc('start_ugc_submission',{p_token_hash:ugcHash(token),p_client_hash:ugcHash(`${process.env.SHOPIFY_CLIENT_SECRET}:${client}`)});
  if(error)throw new Error(error.message);
  return {token,id:data};
}
export async function prepareUgcVideo(body:Record<string,unknown>) {
  const row=await ugcSubmissionSession(String(body.token||''));
  if(row.status!=='draft')throw new Error('This submission has already been sent.');
  const name=String(body.fileName||'').slice(0,200),type=ugcVideoType(name,String(body.contentType||''),Number(body.size));
  // One path per session prevents retrying uploads from creating unlimited files.
  const path=`${row.id}/submission.${name.split('.').pop()?.toLowerCase()}`;
  if(row.video_path&&row.video_path!==path)throw new Error('Reload the page before choosing a different video format.');
  const db=mobileServiceClient();
  const existing=await db.storage.from('customer-ugc').list(row.id,{limit:10});
  if(existing.error)throw existing.error;
  const savedFile=existing.data?.find(file=>`${row.id}/${file.name}`===path);
  if(savedFile){
    if(row.video_name!==name||Number(savedFile.metadata?.size)!==Number(body.size))throw new Error('Reload the page before choosing a different video.');
    return {alreadyUploaded:true,path,contentType:type};
  }
  const {error:saveError}=await db.from('marketing_ugc_submissions').update({video_path:path,video_name:name}).eq('id',row.id).eq('status','draft');
  if(saveError)throw saveError;
  const {data,error}=await db.storage.from('customer-ugc').createSignedUploadUrl(path);
  if(error)throw error;
  return {signedUrl:data.signedUrl,path,contentType:type};
}
export async function submitUgc(body:Record<string,unknown>) {
  const row=await ugcSubmissionSession(String(body.token||''));
  if(row.status!=='draft')return {reference:`UGC-${row.id.slice(0,8).toUpperCase()}`};
  const details=ugcCustomerDetails(body);
  if(!row.video_path)throw new Error('Upload your video first.');
  const db=mobileServiceClient();
  const {data:files,error:listError}=await db.storage.from('customer-ugc').list(row.id,{limit:10});
  const file=files?.find(file=>`${row.id}/${file.name}`===row.video_path);
  if(listError||!file||!file.metadata?.size||file.metadata.size>ugcVideoLimit)throw new Error('Your video upload is incomplete. Please try again.');
  ugcVideoType(row.video_name,file.metadata.mimetype,Number(file.metadata.size));
  const {error}=await db.from('marketing_ugc_submissions').update({...details,status:'pending',submitted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',row.id).eq('status','draft');
  if(error)throw error;
  return {reference:`UGC-${row.id.slice(0,8).toUpperCase()}`};
}
