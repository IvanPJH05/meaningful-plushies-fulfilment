import {NextResponse} from 'next/server';
import {originalSubmission} from '../../../lib/ugc-original-videos';
export const runtime='nodejs';
const origins=new Set(['http://127.0.0.1:4176','http://localhost:4176','https://meaningfulplushies.com','https://www.meaningfulplushies.com']);
function headers(request:Request){const origin=request.headers.get('origin');return {'Cache-Control':'no-store','Vary':'Origin',...(origin&&origins.has(origin)?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};}
export async function OPTIONS(request:Request){return new Response(null,{status:204,headers:headers(request)});}
export async function POST(request:Request){try{
 const origin=request.headers.get('origin');if(origin&&!origins.has(origin))return NextResponse.json({error:'This submission page is not allowed.'},{status:403,headers:headers(request)});
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('Send submission details as JSON.');
 // Only metadata reaches Vercel. File bytes go directly to private storage.
 const reader=request.body?.getReader();if(!reader)throw new Error('Missing submission.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>15000){await reader.cancel();throw new Error('Submission details are too long.');}chunks.push(part.value);}
 const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(!body||typeof body!=='object'||Array.isArray(body)||body.website)throw new Error('Invalid submission.');
 const client=request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
 return NextResponse.json(await originalSubmission(body,client),{headers:headers(request)});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:typeof error==='object'&&error&&'message' in error?String(error.message):'Could not save your submission. Please retry.'},{status:400,headers:headers(request)});}}
