import {it,expect,vi,beforeEach} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const mock=vi.hoisted(()=>({session:vi.fn(),start:vi.fn(),rpc:vi.fn(),info:vi.fn()}));
vi.mock('../lib/ugc-submissions',()=>({ugcSubmissionSession:mock.session,startUgcSubmission:mock.start}));
vi.mock('../lib/mobile-api',()=>({mobileServiceClient:()=>({rpc:mock.rpc,storage:{from:()=>({info:mock.info})},from:()=>({select:()=>({eq:()=>({eq:()=>({single:async()=>({data:{storage_path:'private/original.mp4',file_size:80*1024**2,content_type:'video/mp4',status:'uploading'},error:null})})})})})})}));
import {originalVideoType,originalVideoLimit,originalSubmission,originalConsent} from '../lib/ugc-original-videos';
import {POST} from '../app/api/customer-ugc/route';
const id='00000000-0000-4000-8000-000000000001',file='00000000-0000-4000-8000-000000000002';
beforeEach(()=>{vi.resetAllMocks();mock.session.mockResolvedValue({id,status:'draft'});});
it('accepts large original phone videos and rejects executable or invalid files',()=>{
 expect(originalVideoType('iPhone.MOV','',3*1024**3)).toBe('video/quicktime');
 expect(originalVideoType('large.mp4','video/mp4',originalVideoLimit)).toBe('video/mp4');
 for(const [name,type,size] of [['a.html','text/html',100],['a.mp4','text/html',100],['a.mp4','video/mp4',0],['a.mp4','video/mp4',originalVideoLimit+1]])expect(()=>originalVideoType(String(name),String(type),Number(size))).toThrow();
});
it('rejects incomplete originals and verifies exact size before marking complete',async()=>{
 mock.info.mockResolvedValue({data:{size:50,contentType:'video/mp4'},error:null});
 await expect(originalSubmission({action:'complete',token:'token',fileId:file},'ip')).rejects.toThrow('incomplete');expect(mock.rpc).not.toHaveBeenCalled();
 mock.info.mockResolvedValue({data:{size:80*1024**2,contentType:'video/mp4'},error:null});mock.rpc.mockResolvedValue({error:null});
 expect(await originalSubmission({action:'complete',token:'token',fileId:file},'ip')).toEqual({ok:true,fileId:file});
});
it('records the displayed consent and never issues a reward on submission',async()=>{
 mock.rpc.mockResolvedValue({data:'UGC-00000000',error:null});
 await originalSubmission({action:'submit',token:'token',customerName:'Test',phone:'0123456789',email:'test@example.com',orderNumber:'#1',consent:true,language:'ms'},'ip');
 expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('finish_ugc_original_submission',{p_submission:id,p_details:expect.objectContaining({consent_text:originalConsent.ms})});
});
it('recovers an original saved just before a completion-request disconnect',async()=>{
 mock.rpc.mockResolvedValueOnce({data:{storage_path:'private/original.mp4',status:'uploading',file_size:80*1024**2,content_type:'video/mp4'},error:null}).mockResolvedValueOnce({error:null});
 mock.info.mockResolvedValue({data:{size:80*1024**2,contentType:'video/mp4'},error:null});
 expect(await originalSubmission({action:'upload',token:'token',fileId:file,fileName:'original.mp4',size:80*1024**2,contentType:'video/mp4'},'ip')).toEqual({alreadyUploaded:true,fileId:file});
 expect(mock.rpc).toHaveBeenLastCalledWith('manage_ugc_video',{p_submission:id,p_id:file,p_action:'complete'});
});
it('blocks foreign origins, oversized metadata and honeypot submissions before accessing storage',async()=>{
 const req=(body:string,origin='http://127.0.0.1:4176')=>new Request('https://app.test/api/customer-ugc',{method:'POST',headers:{origin,'Content-Type':'application/json'},body});
 expect((await POST(req('{}','https://other.example'))).status).toBe(403);
 expect((await POST(req(JSON.stringify({notes:'x'.repeat(16000)})))).status).toBe(400);
 expect((await POST(req(JSON.stringify({action:'start',website:'bot'})))).status).toBe(400);expect(mock.start).not.toHaveBeenCalled();
});
it('accepts many originals atomically, requires all uploads complete, and keeps data private',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
  for(const name of ['20261017154739_marketing_customer_ugc.sql','20261029104521_ugc_product_collection.sql','20261029114847_customer_ugc_submissions.sql','20261123172454_customer_ugc_original_video_uploads.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
  await db.query('insert into marketing_ugc_submissions(id,token_hash,client_hash) values($1,$2,$3)',[id,'test','test']);
  const details={customer_name:'Test',phone:'0123456789',email:'test@example.com',order_number:'#1',consent:true,consent_text:originalConsent.en};
  const finish=()=>db.query('select finish_ugc_original_submission($1,$2::jsonb)',[id,JSON.stringify(details)]);
  await expect(finish()).rejects.toThrow('at least one');
  // No application-level file-count cap, including across admin file pages.
  for(let i=1;i<=105;i++){
   const fid=`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
   await db.query("select manage_ugc_video($1,$2,'reserve','original.mov','video/quicktime',3221225472)",[id,fid]);
   if(i===1){await expect(finish()).rejects.toThrow('every video');await expect(db.query("select manage_ugc_video($1,$2,'reserve','changed.mov','video/quicktime',3221225472)",[id,fid])).rejects.toThrow('original');}
   await db.query("select manage_ugc_video($1,$2,'complete')",[id,fid]);
  }
  const a=await finish();expect(await finish()).toEqual(a);
  expect((await db.query("select status from marketing_ugc_submissions where id=$1",[id])).rows).toEqual([{status:'pending'}]);
  expect((await db.query('select count(*)::int n from marketing_ugc_samples')).rows).toEqual([{n:0}]);
  await expect(db.query("select manage_ugc_video($1,$2,'complete')",[id,file])).rejects.toThrow('already');
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await expect(db.query('select * from marketing_ugc_submission_videos')).rejects.toThrow('permission');await expect(db.query("select finish_ugc_original_submission($1,'{}')",[id])).rejects.toThrow('permission');await db.exec('reset role');}
 }finally{await db.close();}
});
