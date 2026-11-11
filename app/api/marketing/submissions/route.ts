import {NextResponse} from 'next/server';
import {randomBytes} from 'node:crypto';
import {mobileServiceClient,requireMobileSession} from '../../../../lib/mobile-api';
import {normalizeUgcCode,ugcCollection} from '../../../../lib/marketing-ugc';
export const runtime='nodejs';
const columns='id,status,customer_name,phone,email,order_number,notes,consent,consent_text,video_name,reward_id,review_notes,reviewed_by,reviewed_at,submitted_at,updated_at';
async function admin(request:Request){const session=await requireMobileSession(request);if(session.role!=='admin')throw new Error('ADMIN_REQUIRED');return session;}
function failure(error:unknown){const message=error instanceof Error?error.message:'Could not update submissions.';return NextResponse.json({error:message},{status:message==='ADMIN_REQUIRED'?403:message.includes('REQUIRED')?401:400});}
export async function GET(request:Request){try{
 await admin(request);const params=new URL(request.url).searchParams, status=params.get('status')||'pending', offset=Number(params.get('offset')||0);
 if(!['pending','approved','rejected'].includes(status)||!Number.isInteger(offset)||offset<0||offset>100000)throw new Error('Invalid submission filter.');
 const {data,error}=await mobileServiceClient().from('marketing_ugc_submissions').select(columns).eq('status',status).order('submitted_at',{ascending:false}).order('id').range(offset,offset+50);
 if(error)throw error;return NextResponse.json({submissions:data?.slice(0,50)||[],hasMore:(data?.length||0)>50},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const session=await admin(request),body=await request.json();
 if(!/^[a-f0-9-]{36}$/i.test(String(body.id||'')))throw new Error('Invalid submission.');
 const db=mobileServiceClient();
 if(body.action==='video'){
  const {data,error}=await db.from('marketing_ugc_submissions').select('video_path,status').eq('id',body.id).single();
  if(error||!data?.video_path||data.status==='draft')throw new Error('Submitted video not found.');
  const signed=await db.storage.from('customer-ugc').createSignedUrl(data.video_path,600);
  if(signed.error)throw signed.error;return NextResponse.json({url:signed.data.signedUrl},{headers:{'Cache-Control':'no-store'}});
 }
 if(!['approve','reject'].includes(body.action)||typeof body.expectedUpdatedAt!=='string')throw new Error('Invalid review action.');
 const notes=String(body.notes||'').trim();if(notes.length>5000)throw new Error('Review notes must be 5,000 characters or fewer.');
 const {data,error}=await db.rpc('review_ugc_submission',{p_id:body.id,p_expected_updated_at:body.expectedUpdatedAt,p_action:body.action,p_actor:session.username,p_notes:notes,p_collection:ugcCollection(body.productCollection),p_code:normalizeUgcCode(randomBytes(5).toString('hex'))});
 if(error)throw new Error(error.message);
 return NextResponse.json({ok:true,rewardId:data},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}}
