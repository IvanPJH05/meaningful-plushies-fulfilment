import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifyUgcProxy(url:URL,secret=process.env.SHOPIFY_CLIENT_SECRET,shop=process.env.SHOPIFY_SHOP_DOMAIN) {
  shop=shop?.replace(/^https?:\/\//,'').replace(/\/$/,'');
  const signature=url.searchParams.get('signature')||'';
  if(!secret||!shop||!/^\w[\w.-]*\.myshopify\.com$/.test(shop)||url.searchParams.get('shop')!==shop)throw new Error('Storefront verification failed. Please reload this page.');
  const timestamp=Number(url.searchParams.get('timestamp'));
  if(!timestamp||Math.abs(Date.now()/1000-timestamp)>300||!/^[a-f0-9]{64}$/.test(signature))throw new Error('Storefront verification expired. Please reload this page.');
  const keys=[...new Set(url.searchParams.keys())].filter(key=>key!=='signature').sort();
  const payload=keys.map(key=>`${key}=${url.searchParams.getAll(key).join(',')}`).join('');
  const calculated=createHmac('sha256',secret).update(payload).digest();
  if(!timingSafeEqual(calculated,Buffer.from(signature,'hex')))throw new Error('Storefront verification failed. Please reload this page.');
}
