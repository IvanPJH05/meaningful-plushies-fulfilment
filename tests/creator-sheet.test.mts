import {beforeEach,expect,it,vi} from 'vitest';
import {creatorProfileSheetRows,creatorSampleSheetRows,creatorSheetCsv} from '../lib/creator-sheet';
const mocks=vi.hoisted(()=>({db:vi.fn()}));
vi.mock('../lib/mobile-api',()=>({mobileServiceClient:mocks.db}));
import {GET} from '../app/api/creator-sheet/feed/route';
beforeEach(()=>{vi.resetAllMocks();process.env.CREATOR_SHEET_FEED_KEY='a'.repeat(64);});
it('requires the read-only feed key, including malformed Unicode keys',async()=>{
 for(const key of ['', 'wrong', 'é'.repeat(64)]){
 const response=await GET(new Request('https://app.test/api/creator-sheet/feed?view=samples&key='+key));expect(response.status).toBe(404);}
 expect(mocks.db).not.toHaveBeenCalled();
});
it('bundles charm codes without merging distinct creators sharing a code',()=>{
 const rows=creatorSampleSheetRows([{id:'1',creator_name:'One',sample_code:'ONE-1',product_collection:'plush_charms_v1',order_number:'123'}, {id:'2',creator_name:'One',sample_code:'ONE-2',product_collection:'plush_charms_v1',order_number:'124'}, {id:'3',creator_name:'Two',sample_code:'INF(B2)',product_collection:'classics'}, {id:'4',creator_name:'Three',sample_code:'INF(B2)',product_collection:'classics'}]);
 expect(rows).toHaveLength(3);expect(rows.find(row=>row[0]==='One')?.[3]).toBe('ONE-1 / ONE-2');expect(rows.find(row=>row[0]==='One')?.[4]).toBe('123 / 124');
});
it('preserves phone digits and excludes private payout fields',()=>{
 const rows=creatorProfileSheetRows([{display_name:'One',phone:'+60122260106',commission_rate:10,payout_account_number:'private-bank-account',internal_notes:'private-notes'}]);
 expect(rows[0][2]).toBe('012-2260106');expect(rows[0][6]).toBe(.1);expect(JSON.stringify(rows)).not.toContain('private-');
 expect(creatorSheetCsv([['One, Two','say "hello"','line\nbreak']])).toBe('"One, Two","say ""hello""","line\nbreak"');
});
it('paginates beyond 500 records and returns a noncached CSV',async()=>{
 const range=vi.fn().mockResolvedValueOnce({data:Array.from({length:500},(_,i)=>({id:String(i),creator_name:'Creator '+i,sample_code:String(i)})),error:null}).mockResolvedValueOnce({data:[{id:'500',creator_name:'Last',sample_code:'LAST'}],error:null});
 mocks.db.mockReturnValue({from:()=>({select:()=>({order:()=>({range})})})});
 const response=await GET(new Request('https://app.test/api/creator-sheet/feed?view=samples&key='+'a'.repeat(64)));
 expect(response.status).toBe(200);expect(range).toHaveBeenCalledTimes(2);expect(response.headers.get('cache-control')).toContain('no-store');expect((await response.text()).split('\r\n')).toHaveLength(502);
});
it('does not present database failures as an empty successful directory',async()=>{
 mocks.db.mockReturnValue({from:()=>({select:()=>({order:()=>({range:async()=>({data:null,error:Error('private database failure')})})})})});
 const response=await GET(new Request('https://app.test/api/creator-sheet/feed?view=profiles&key='+'a'.repeat(64)));
 expect(response.status).toBe(503);expect(await response.text()).not.toContain('private database');
});
