import {beforeEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({row:{} as Record<string,unknown>,files:[] as Record<string,unknown>[],signed:vi.fn(),session:vi.fn(),rpc:vi.fn()}));
vi.mock('../lib/mobile-api',()=>({requireMobileSession:state.session,mobileServiceClient:()=>({
 rpc:state.rpc,
 from:()=>{
  let patch:Record<string,unknown>|null=null;const filters:Record<string,unknown>={};
  const result=()=>({data:Object.entries(filters).every(([key,value])=>state.row[key]===value)?state.row:null,error:null});
  const query={select:()=>query,eq:(key:string,value:unknown)=>{filters[key]=value;return query;},gt:()=>query,single:async()=>result(),update:(value:Record<string,unknown>)=>{patch=value;return query;},then:(resolve:(value:unknown)=>unknown)=>{if(patch&&result().data)Object.assign(state.row,patch);return Promise.resolve({error:null}).then(resolve);}};return query;
 },storage:{from:()=>({list:async()=>({data:state.files,error:null}),createSignedUploadUrl:state.signed})}
})}));
import {ugcHash,prepareUgcVideo,submitUgc} from '../lib/ugc-submissions';
import {GET,POST} from '../app/api/marketing/submissions/route';
const token='a'.repeat(64),id='00000000-0000-4000-8000-000000000001';
const customer={token,customerName:'Customer',phone:'0123456789',email:'customer@example.com',orderNumber:'#1234',consent:true};
beforeEach(()=>{vi.resetAllMocks();state.row={id,token_hash:ugcHash(token),status:'draft',video_path:'',video_name:''};state.files=[];state.signed.mockResolvedValue({data:{signedUrl:'https://storage.test/upload'},error:null});state.session.mockResolvedValue({role:'staff'});});
it('verifies uploaded file metadata before accepting a submission and makes resubmission idempotent',async()=>{
 const upload=await prepareUgcVideo({token,fileName:'clip.mp4',contentType:'video/mp4',size:100});
 expect(upload.path).toBe(`${id}/submission.mp4`);expect(state.signed).toHaveBeenCalledWith(`${id}/submission.mp4`);
 await expect(submitUgc(customer)).rejects.toThrow('incomplete');
 state.files=[{name:'submission.mp4',metadata:{size:100,mimetype:'video/mp4'}}];
 const result=await submitUgc(customer);expect(state.row.status).toBe('pending');expect(state.row.customer_name).toBe('Customer');
 expect(await submitUgc({...customer,customerName:'Changed'})).toEqual(result);expect(state.row.customer_name).toBe('Customer');
 await expect(prepareUgcVideo({token,fileName:'clip.mp4',contentType:'video/mp4',size:100})).rejects.toThrow('already');
});
it('can recover a completed upload without granting overwrite access',async()=>{
 Object.assign(state.row,{video_path:`${id}/submission.mp4`,video_name:'clip.mp4'});state.files=[{name:'submission.mp4',metadata:{size:100,mimetype:'video/mp4'}}];
 expect(await prepareUgcVideo({token,fileName:'clip.mp4',contentType:'video/mp4',size:100})).toMatchObject({alreadyUploaded:true});expect(state.signed).not.toHaveBeenCalled();
 await expect(prepareUgcVideo({token,fileName:'different.mp4',contentType:'video/mp4',size:100})).rejects.toThrow('different');
});
it('rejects unknown session tokens and staff access to customer submissions',async()=>{
 await expect(submitUgc({...customer,token:'b'.repeat(64)})).rejects.toThrow('expired');
 expect((await GET(new Request('https://app.test/api/marketing/submissions'))).status).toBe(403);
 expect((await POST(new Request('https://app.test/api/marketing/submissions',{method:'POST',body:JSON.stringify({id,action:'approve'})}))).status).toBe(403);
 expect(state.rpc).not.toHaveBeenCalled();
});
