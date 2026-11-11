import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({graphql:vi.fn()}));
vi.mock('../lib/shopify-orders',async importOriginal=>({...await importOriginal<object>(),shopDomain:()=> 'shop.myshopify.com',shopifyGraphql:mocks.graphql}));
import {createUgcSampleDiscountCode} from '../lib/manual-orders';
const id='00000000-0000-4000-8000-000000000001';
beforeEach(()=>{vi.resetAllMocks();delete process.env.SHOPIFY_CREATOR_SAMPLE_FUNCTION_ID;});
it('creates a single-use, one-product Function discount with shipping and all-product eligibility',async()=>{
 mocks.graphql.mockResolvedValueOnce({data:{codeDiscountNodeByCode:null}})
 .mockResolvedValueOnce({data:{shopifyFunctions:{nodes:[{id:'function-id',handle:'creator-sample-claim-function'}]}}})
 .mockResolvedValueOnce({data:{collections:{nodes:[{id:'all-products-id',title:'UGC - All Products'}]}}})
 .mockResolvedValueOnce({data:{discountCodeAppCreate:{codeAppDiscount:{discountId:'discount-id'},userErrors:[]}}});
 expect(await createUgcSampleDiscountCode('UGC-TEST','Customer',id)).toBe('discount-id');
 const input=mocks.graphql.mock.calls[3][2].codeAppDiscount;
 expect(input).toMatchObject({code:'UGC-TEST',functionId:'function-id',usageLimit:1,appliesOncePerCustomer:true,discountClasses:['PRODUCT','SHIPPING'],combinesWith:{orderDiscounts:false,productDiscounts:false,shippingDiscounts:false}});
 expect(JSON.parse(input.metafields[0].value)).toEqual({eligibleCollectionIds:['all-products-id']});
});
it('reuses only the code belonging to this saved UGC entry',async()=>{
 mocks.graphql.mockResolvedValue({data:{codeDiscountNodeByCode:{id:'discount-id',codeDiscount:{title:`UGC Sample Claim - Customer [${id}] - UGC - All Products`}}}});
 expect(await createUgcSampleDiscountCode('UGC-TEST','Customer',id)).toBe('discount-id');
 expect(mocks.graphql).toHaveBeenCalledTimes(1);
});
it('rejects a collision with another offer without changing that discount',async()=>{
 mocks.graphql.mockResolvedValue({data:{codeDiscountNodeByCode:{id:'other',codeDiscount:{title:'Another offer'}}}});
 await expect(createUgcSampleDiscountCode('UGC-TEST','Customer',id)).rejects.toThrow('another offer');
 expect(mocks.graphql).toHaveBeenCalledTimes(1);
});
