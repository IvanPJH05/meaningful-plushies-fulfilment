import { shopDomain, shopifyGraphql } from "./shopify-orders";

/** Uses the product video already uploaded in Shopify, rather than copying it into this app. */
export async function shopifyProductVideoForHandle(handle: string) {
  const domain = shopDomain();
  if (!domain || !handle) return "";
  const result = await shopifyGraphql<{
    data?: { products?: { nodes?: Array<{ media?: { nodes?: Array<{ sources?: Array<{ url?: string; mimeType?: string }> }> } }> } };
  }>(domain, `
    query CollectionProductVideo($query: String!) {
      products(first: 1, query: $query) {
        nodes {
          media(first: 10) {
            nodes {
              ... on Video { sources { url mimeType } }
            }
          }
        }
      }
    }
  `, { query: `handle:${handle}` });
  const videos = result?.data?.products?.nodes?.[0]?.media?.nodes || [];
  for (const video of videos) {
    const source = video.sources?.find((item) => item.mimeType === "video/mp4") || video.sources?.[0];
    if (source?.url) return source.url;
  }
  return "";
}
