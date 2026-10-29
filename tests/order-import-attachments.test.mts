import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),sign:vi.fn(),download:vi.fn(),order:vi.fn()}));
vi.mock('../lib/mobile-api',()=>({requireMobileSession:mocks.session,mobileServiceClient:()=>({storage:{from:()=>({createSignedUploadUrl:mocks.sign,download:mocks.download})}})}));
vi.mock('../lib/supabase',()=>({fetchSharedOrderById:mocks.order}));
import {POST} from '../app/api/fulfilment/orders/import/attachment/route';
import {GET} from '../app/api/tiktok/attachment/route';
beforeEach(()=>{vi.resetAllMocks();mocks.session.mockResolvedValue({role:'staff'});mocks.sign.mockResolvedValue({data:{signedUrl:'https://storage.test/signed'}});});
const request=(body:unknown)=>new Request('https://app.test/api/fulfilment/orders/import/attachment',{method:'POST',body:JSON.stringify(body)});
it('requires warehouse authentication before signing uploads',async()=>{mocks.session.mockRejectedValue(Error('SIGN_IN_REQUIRED'));expect((await POST(request({}))).status).toBe(401);expect(mocks.sign).not.toHaveBeenCalled();});
it('validates upload metadata and generates a safe unique storage path',async()=>{
 expect((await POST(request({fileName:'video.mp4',size:51*1024*1024,contentType:'video/mp4'}))).status).toBe(400);
 const response=await POST(request({fileName:'../video file.mp4',size:3434839,contentType:'video/mp4'}));expect(response.status).toBe(200);expect((await response.json()).path).toMatch(/^[a-f0-9-]{36}\/[a-f0-9-]{36}-[A-Za-z0-9._-]+$/);
});
it('downloads imported TikTok videos from Storage',async()=>{
 mocks.order.mockResolvedValue({salesChannel:'tiktok',orderNumber:'TT1341 12345',character:'Billy',tikTokFileName:'voice.mp4',tikTokFileType:'video/mp4',tikTokFileDataUrl:'supabase-storage:12345678-1234-1234-1234-123456789abc/voice.mp4'});
 mocks.download.mockResolvedValue({data:new Blob(['fixture-video'],{type:'video/mp4'})});
 const response=await GET(new Request('https://app.test/api/tiktok/attachment?orderId=fixture'));
 expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('video/mp4');expect(await response.text()).toBe('fixture-video');
});
