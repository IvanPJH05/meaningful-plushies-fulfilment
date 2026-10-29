import {NextResponse} from 'next/server';
import {verifyUgcProxy} from '../../../lib/shopify-proxy-auth';
import {prepareUgcVideo,startUgcSubmission,submitUgc} from '../../../lib/ugc-submissions';
export const runtime='nodejs';
export async function POST(request:Request) {
  try {
    verifyUgcProxy(new URL(request.url));
    if(Number(request.headers.get('content-length'))>15000)throw new Error('Submission is too large.');
    const raw=await request.text();if(raw.length>15000)throw new Error('Submission is too large.');
    const body=JSON.parse(raw);
    if(body.website)throw new Error('Submission could not be accepted.');
    let result;
    if(body.action==='start')result={session:await startUgcSubmission(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown')};
    else if(body.action==='upload')result={upload:await prepareUgcVideo(body)};
    else if(body.action==='submit')result=await submitUgc(body);
    else throw new Error('Unknown submission action.');
    return NextResponse.json({ok:true,...result},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'Your submission could not be saved.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
