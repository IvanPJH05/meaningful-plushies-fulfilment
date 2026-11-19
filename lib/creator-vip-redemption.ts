import { mobileServiceClient } from "./mobile-api";
import { shopDomain, shopifyGraphql } from "./shopify-orders";

type VipRedemptionRecord = {
  id: string;
  discount_code: string;
  sample_id: string | null;
  redeemed_at: string | null;
};

export function vipRedemptionQuery(invites: { discount_code: string }[]) {
  const variables: Record<string, string> = {};
  const declarations: string[] = [];
  const fields = invites.map((invite, index) => {
    declarations.push(`$code${index}: String!, $orders${index}: String!`);
    variables[`code${index}`] = invite.discount_code;
    variables[`orders${index}`] = `status:any discount_code:${JSON.stringify(invite.discount_code)}`;
    return `
      discount${index}: codeDiscountNodeByCode(code: $code${index}) {
        codeDiscount {
          ... on DiscountCodeBasic { asyncUsageCount }
          ... on DiscountCodeApp { asyncUsageCount }
        }
      }
      orders${index}: orders(first: 1, query: $orders${index}) { nodes { discountCodes } }
    `;
  });
  return { query: `query VipProductDiscountRedemption(${declarations.join(", ")}) { ${fields.join("\n")} }`, variables };
}

// Signup, a saved selection, and a cart containing the code do not redeem it.
// Shopify usage counts and completed orders both confirm actual code usage.
export async function syncVipRedemptions<T extends VipRedemptionRecord>(invites: T[]): Promise<T[]> {
  const candidates = invites.filter(invite => !invite.redeemed_at && invite.sample_id);
  if (!candidates.length) return invites;
  const domain = shopDomain();
  if (!domain) throw new Error("Shopify shop domain is not configured.");
  const operation = vipRedemptionQuery(candidates);
  type DiscountUsage = { codeDiscount: { asyncUsageCount?: number } };
  type Orders = { nodes: { discountCodes: string[] }[] };
  const result = await shopifyGraphql<{
    data?: Record<string, DiscountUsage | Orders | null>;
    errors?: { message: string }[];
  }>(domain, operation.query, operation.variables);
  if (!result?.data || result.errors?.length) {
    throw new Error("Shopify could not confirm the creator discount’s redemption status.");
  }
  const usedIds = candidates.filter((invite, index) => {
    const usage = result.data![`discount${index}`] as DiscountUsage | null;
    const orders = result.data![`orders${index}`] as Orders | null;
    return (usage?.codeDiscount.asyncUsageCount ?? 0) > 0 ||
      orders?.nodes.some(order => order.discountCodes.some(code => code.toUpperCase() === invite.discount_code.toUpperCase()));
  }).map(invite => invite.id);
  if (!usedIds.length) return invites;

  const redeemedAt = new Date().toISOString();
  const { error } = await mobileServiceClient().from("creator_vip_invites")
    .update({ redeemed_at: redeemedAt }).in("id", usedIds).is("redeemed_at", null);
  if (error) throw error;
  const used = new Set(usedIds);
  return invites.map(invite => used.has(invite.id) ? { ...invite, redeemed_at: redeemedAt } : invite);
}
