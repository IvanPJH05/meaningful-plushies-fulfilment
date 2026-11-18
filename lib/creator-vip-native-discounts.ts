import { shopDomain, shopifyGraphql } from "./shopify-orders";

const productOptions = new Set([
  "build-your-meaningful-plushie-wa-b-5s", "build-your-meaningful-plushie-wa-b-10s", "build-your-meaningful-plushie-wa-b-20s",
  "build-your-meaningful-plushie-wa-h-5s", "build-your-meaningful-plushie-wa-h-10s", "hunnie-wa-order",
  "build-your-meaningful-plushie-wa-t-5s", "build-your-meaningful-plushie-wa-t-10s", "tootsie-wa-order",
  "build-your-meaningful-plushie-wa-d-5s", "build-your-meaningful-plushie-wa-d-10s", "dragon-warrior-wa-order",
]);

export function vipProductHandle(value: unknown) {
  return typeof value === "string" && productOptions.has(value) ? value : "";
}

export function vipShippingCode(inviteId: string) {
  return `VIP-SHIP-${inviteId.replaceAll("-", "").slice(0, 20).toUpperCase()}`;
}

const getProduct = `query VipCreatorPlushie($identifier: ProductIdentifierInput!) {
  productByIdentifier(identifier: $identifier) { handle variants(first: 2) { nodes { id price } } }
}`;
const getDiscount = `query VipCreatorNativeDiscount($code: String!) {
  codeDiscountNodeByCode(code: $code) {
    id
    codeDiscount {
      __typename
      ... on DiscountCodeBasic { title status usageLimit }
      ... on DiscountCodeFreeShipping { title status usageLimit }
    }
  }
}`;
const createProduct = `mutation VipCreatorProductDiscount($input: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $input) {
    codeDiscountNode { id }
    userErrors { message }
  }
}`;
const createShipping = `mutation VipCreatorShippingDiscount($input: DiscountCodeFreeShippingInput!) {
  discountCodeFreeShippingCreate(freeShippingCodeDiscount: $input) {
    codeDiscountNode { id }
    userErrors { message }
  }
}`;

type MutationResult = {
  codeDiscountNode?: { id: string };
  userErrors?: { message: string }[];
};

async function ensureDiscount<T extends { code: string; title: string }>(domain: string, kind: "product" | "shipping", input: T) {
  const result = await shopifyGraphql<{
    data?: { discountCodeBasicCreate?: MutationResult; discountCodeFreeShippingCreate?: MutationResult };
    errors?: { message: string }[];
  }>(domain, kind === "product" ? createProduct : createShipping, { input });
  const created = result?.data?.discountCodeBasicCreate ?? result?.data?.discountCodeFreeShippingCreate;
  if (created?.codeDiscountNode?.id) return created.codeDiscountNode.id;

  const lookup = await shopifyGraphql<{
    data?: { codeDiscountNodeByCode?: {
      id: string;
      codeDiscount: { __typename: string; title: string; status: string; usageLimit: number };
    } };
  }>(domain, getDiscount, { code: input.code });
  const record = lookup?.data?.codeDiscountNodeByCode;
  const expectedType = kind === "product" ? "DiscountCodeBasic" : "DiscountCodeFreeShipping";
  if (record?.codeDiscount.__typename === expectedType && record.codeDiscount.title === input.title &&
      record.codeDiscount.status === "ACTIVE" && record.codeDiscount.usageLimit === 1) return record.id;
  const reason = created?.userErrors?.[0]?.message ?? result?.errors?.[0]?.message ?? "Shopify did not confirm the discount.";
  throw new Error(reason);
}

export async function provisionVipNativeDiscounts(invite: { id: string; username: string; discount_code: string }, handle: string) {
  const domain = shopDomain();
  if (!domain) throw new Error("Shopify shop domain is not configured.");
  const lookup = await shopifyGraphql<{
    data?: { productByIdentifier?: { handle: string; variants: { nodes: { id: string; price: string }[] } } };
  }>(domain, getProduct, { identifier: { handle } });
  const product = lookup?.data?.productByIdentifier;
  const variant = product?.variants.nodes[0];
  if (product?.handle !== handle || product.variants.nodes.length !== 1 || !variant?.id ||
      !/^[0-9]+(?:\.[0-9]{1,2})?$/.test(variant.price) || Number(variant.price) <= 0) {
    throw new Error("The selected plushie variant or price could not be verified.");
  }

  const base = {
    context: { all: "ALL" },
    usageLimit: 1,
    appliesOncePerCustomer: true,
    startsAt: new Date().toISOString(),
  };
  const suffix = `@${invite.username} - ${invite.id}`;
  const productId = await ensureDiscount(domain, "product", {
    ...base,
    code: invite.discount_code,
    title: `VIP Creator Plushie - ${suffix}`,
    combinesWith: { productDiscounts: false, orderDiscounts: false, shippingDiscounts: true },
    customerGets: {
      items: { products: { productVariantsToAdd: [variant.id] } },
      value: { discountAmount: { amount: variant.price, appliesOnEachItem: false } },
    },
  });
  const shippingId = await ensureDiscount(domain, "shipping", {
    ...base,
    code: vipShippingCode(invite.id),
    title: `VIP Creator Shipping - ${suffix}`,
    combinesWith: { productDiscounts: true, orderDiscounts: false, shippingDiscounts: false },
    destination: { all: true },
  });
  return { productId, shippingId };
}
