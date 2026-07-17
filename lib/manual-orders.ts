import { randomInt, randomUUID } from "node:crypto";

import { buildManualOrderCustomerLink } from "./manual-order-links";
import { manualOrderProductByKey, type ManualOrderProductConfig } from "./manual-order-products";
import { shopDomain, shopifyGraphql, textValue } from "./shopify-orders";
import { fetchManualOrders } from "./supabase";
import type { ManualOrder } from "./types";

export type ManualOrderCreateInput = {
  customerName: string;
  phone: string;
  productKey: string;
  character?: string;
  shippingRegion: "WEST" | "EAST";
};

type DiscountUserError = { field?: string[]; message?: string; code?: string };

function asShopifyGid(value: string, type: "Product" | "ProductVariant") {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("gid://") ? trimmed : `gid://shopify/${type}/${trimmed.replace(/\D/g, "")}`;
}

function userErrorMessage(errors: DiscountUserError[] | undefined, fallback: string) {
  const messages = (errors ?? []).map((error) => error.message).filter(Boolean);
  return messages.length ? messages.join(" ") : fallback;
}

const manualOrderCharacters = ["Billy", "Tootsie", "Hunnie", "Dragon Warrior"] as const;

const manualOrderCharacterProductHandles: Record<string, string> = {
  billy: "billy-wa-order",
  hunnie: "hunnie-wa-order",
  tootsie: "tootsie-wa-order",
  "dragon warrior": "dragon-warrior-wa-order",
};

const knownMeaningfulPlushieVariantIds: Record<string, Record<string, string>> = {
  billy: {
    "5": "42426495959111",
    "10": "42426495991879",
    "20": "42426496024647",
  },
  hunnie: {
    "5": "42426496090183",
    "10": "42426496122951",
    "20": "42426496155719",
  },
  tootsie: {
    "5": "42426496221255",
    "10": "42426496254023",
    "20": "42426496286791",
  },
  "dragon warrior": {
    "5": "42426496352327",
    "10": "42426496385095",
    "20": "42426496417863",
  },
};

function normalizeManualOrderCharacter(value?: string) {
  const normalized = (value ?? "").trim().toLowerCase();
  return manualOrderCharacters.find((character) => character.toLowerCase() === normalized) ?? "";
}

function productHandleFromPath(productPath: string) {
  const clean = productPath.split(/[?#]/)[0].replace(/^https?:\/\/[^/]+\//, "").replace(/^\/+|\/+$/g, "");
  const parts = clean.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function manualOrderSpeakerSeconds(product: ManualOrderProductConfig) {
  const match = `${product.key} ${product.displayName}`.match(/(\d+)\s*s(?:econds?)?/i);
  return match?.[1] ?? "";
}

function normalizeVariantText(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

async function resolveManualOrderProductFromStorefront(input: ManualOrderCreateInput, product: ManualOrderProductConfig) {
  const handle = productHandleFromPath(product.productPath);
  const storefront = (process.env.SHOPIFY_STOREFRONT_URL || process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_URL || "https://meaningfulplushies.com").replace(/\/+$/, "");
  if (!handle || !storefront) return { productId: "", variantId: "", productPath: "" };

  const response = await fetch(`${storefront}/products/${encodeURIComponent(handle)}.js`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) return { productId: "", variantId: "", productPath: "" };

  const data = await response.json() as {
    id?: number | string;
    variants?: {
      id?: number | string;
      title?: string;
      option1?: string;
      option2?: string;
      option3?: string;
    }[];
  };
  const productId = textValue(data.id);
  const character = normalizeManualOrderCharacter(input.character);
  const seconds = manualOrderSpeakerSeconds(product);
  const variant = data.variants?.find((item) => {
    const title = normalizeVariantText(item.title);
    const option1 = normalizeVariantText(item.option1);
    const option3 = normalizeVariantText(item.option3);
    const characterMatches = character
      ? option1 === character.toLowerCase() || title.includes(character.toLowerCase())
      : true;
    const secondsMatches = seconds
      ? option3 === `${seconds} seconds` || title.includes(`${seconds} seconds`) || title.includes(`${seconds}s`)
      : true;
    return characterMatches && secondsMatches;
  });
  const variantId = textValue(variant?.id);
  if ((character || seconds) && !variantId) return { productId: "", variantId: "", productPath: "" };
  return {
    productId: productId ? asShopifyGid(productId, "Product") : "",
    variantId: variantId ? asShopifyGid(variantId, "ProductVariant") : "",
    productPath: `products/${handle}`,
  };
}

function resolveKnownManualOrderProduct(input: ManualOrderCreateInput, product: ManualOrderProductConfig) {
  const character = normalizeManualOrderCharacter(input.character).toLowerCase();
  const seconds = manualOrderSpeakerSeconds(product);
  const variantId = character && seconds ? knownMeaningfulPlushieVariantIds[character]?.[seconds] ?? "" : "";
  const handle = productHandleFromPath(product.productPath);
  const productId = product.shopifyProductId || (["meaningful-plushie", "meanngful-plushie"].includes(handle) ? "7407587360839" : "");
  return {
    productId: productId ? asShopifyGid(productId, "Product") : "",
    variantId: variantId ? asShopifyGid(variantId, "ProductVariant") : "",
    productPath: product.productPath,
  };
}

async function resolveManualOrderProduct(input: ManualOrderCreateInput, product: ManualOrderProductConfig) {
  const configuredProductId = asShopifyGid(product.shopifyProductId ?? "", "Product");
  const configuredVariantId = asShopifyGid(product.shopifyVariantId ?? "", "ProductVariant");
  if (configuredVariantId) return { productId: configuredProductId, variantId: configuredVariantId, productPath: product.productPath };

  const character = normalizeManualOrderCharacter(input.character).toLowerCase();
  const characterHandle = manualOrderCharacterProductHandles[character];
  if (characterHandle) {
    const characterProduct = {
      ...product,
      productPath: `products/${characterHandle}`,
      shopifyProductId: "",
      shopifyVariantId: "",
    };
    const storefrontCharacterProduct = await resolveManualOrderProductFromStorefront(input, characterProduct);
    if (storefrontCharacterProduct.productId || storefrontCharacterProduct.variantId) return storefrontCharacterProduct;
  }

  const storefrontProduct = await resolveManualOrderProductFromStorefront(input, product);
  if (storefrontProduct.productId || storefrontProduct.variantId) return storefrontProduct;

  const knownProduct = resolveKnownManualOrderProduct(input, product);
  if (knownProduct.productId || knownProduct.variantId) return knownProduct;

  if (configuredProductId) return { productId: configuredProductId, variantId: "", productPath: product.productPath };

  return { productId: "", variantId: "", productPath: product.productPath };
}

export function normalizeManualOrderPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  let normalized = digits;
  if (digits.startsWith("0")) normalized = `6${digits}`;
  if (digits.startsWith("60")) normalized = digits;
  if (digits.startsWith("1") && digits.length >= 9) normalized = `60${digits}`;
  if (!/^60\d{8,11}$/.test(normalized)) {
    throw new Error("Enter a valid Malaysia phone number, for example 0123456789 or 60123456789.");
  }
  return {
    normalized,
    lastFour: normalized.slice(-4),
  };
}

export async function generateManualOrderCode(phoneLastFour: string) {
  const existing = new Set((await fetchManualOrders()).flatMap((order) => [
    order.productDiscountCode,
    order.shippingDiscountCode,
  ].filter(Boolean)));
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const prefix = String(randomInt(0, 10_000)).padStart(4, "0");
    const code = `${prefix}${phoneLastFour}`;
    if (!existing.has(code)) return code;
  }
  throw new Error("Could not generate a unique manual order discount code. Please try again.");
}

export { buildManualOrderCustomerLink };

export async function createCreatorSampleDiscountCode(code: string, creatorName: string) {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) throw new Error("Discount code is required.");

  const domain = shopDomain();
  if (!domain) throw new Error("SHOPIFY_SHOP_DOMAIN is missing in Vercel.");

  const result = await shopifyGraphql<{
    data?: { discountCodeBasicCreate?: { codeDiscountNode?: { id?: string }, userErrors?: DiscountUserError[] } };
    errors?: { message?: string }[];
  }>(domain, `
    mutation CreateCreatorSampleDiscount($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode { id }
        userErrors { field message code }
      }
    }
  `, {
    basicCodeDiscount: {
      title: `Creator Sample - ${creatorName.trim() || normalizedCode}`,
      code: normalizedCode,
      startsAt: new Date().toISOString(),
      usageLimit: 1,
      appliesOncePerCustomer: true,
      context: { all: "ALL" },
      combinesWith: { shippingDiscounts: true },
      customerGets: {
        value: { discountAmount: { amount: "150.00", appliesOnEachItem: false } },
        items: { all: true },
      },
    },
  });

  if (result?.errors?.length) throw new Error(result.errors.map((error) => error.message).filter(Boolean).join(" "));
  const payload = result?.data?.discountCodeBasicCreate;
  if (payload?.userErrors?.length) throw new Error(userErrorMessage(payload.userErrors, "Shopify rejected the creator sample discount."));
  const id = textValue(payload?.codeDiscountNode?.id);
  if (!id) throw new Error("Shopify did not return the creator sample discount ID.");
  return id;
}

async function createProductDiscount(
  domain: string,
  input: ManualOrderCreateInput,
  product: ManualOrderProductConfig,
  code: string,
  expiresAt: string,
  resolvedProduct: { productId: string; variantId: string },
) {
  const { productId, variantId } = resolvedProduct;
  if (!productId && !variantId) {
    throw new Error(`Manual order product "${product.displayName}" could not be found in Shopify from product path "${product.productPath}". Add its Shopify product ID or variant ID in MANUAL_ORDER_PRODUCTS_JSON.`);
  }

  const result = await shopifyGraphql<{
    data?: { discountCodeBasicCreate?: { codeDiscountNode?: { id?: string }, userErrors?: DiscountUserError[] } };
    errors?: { message?: string }[];
  }>(domain, `
    mutation CreateManualProductDiscount($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode { id }
        userErrors { field message code }
      }
    }
  `, {
    basicCodeDiscount: {
      title: `Manual Order - ${input.customerName.trim()} - ${normalizeManualOrderPhone(input.phone).normalized}`,
      code,
      startsAt: new Date().toISOString(),
      endsAt: expiresAt,
      usageLimit: 1,
      appliesOncePerCustomer: true,
      context: { all: "ALL" },
      combinesWith: { shippingDiscounts: true },
      customerGets: {
        value: { percentage: 1 },
        items: variantId
          ? { products: { productVariantsToAdd: [variantId] } }
          : { products: { productsToAdd: [productId] } },
      },
    },
  });

  if (result?.errors?.length) throw new Error(result.errors.map((error) => error.message).filter(Boolean).join(" "));
  const payload = result?.data?.discountCodeBasicCreate;
  if (payload?.userErrors?.length) throw new Error(userErrorMessage(payload.userErrors, "Shopify rejected the product discount."));
  const id = textValue(payload?.codeDiscountNode?.id);
  if (!id) throw new Error("Shopify did not return the product discount ID.");
  return id;
}

export async function createManualOrderDiscounts(input: ManualOrderCreateInput): Promise<ManualOrder> {
  const product = manualOrderProductByKey(input.productKey);
  if (!product) throw new Error("Choose a valid manual order product.");
  if (!input.customerName.trim()) throw new Error("Customer name is required.");

  const domain = shopDomain();
  if (!domain) throw new Error("SHOPIFY_SHOP_DOMAIN is missing in Vercel.");

  const phone = normalizeManualOrderPhone(input.phone);
  const character = normalizeManualOrderCharacter(input.character);
  if (input.character && !character) throw new Error("Choose a valid character.");
  const productCode = await generateManualOrderCode(phone.lastFour);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const resolvedProduct = await resolveManualOrderProduct(input, product);
  const productDiscountShopifyId = await createProductDiscount(domain, input, product, productCode, expiresAt, resolvedProduct);
  const now = new Date().toISOString();
  const productDisplayName = character ? `${character} - ${product.displayName}` : product.displayName;

  return {
    id: randomUUID(),
    customerName: input.customerName.trim(),
    phoneOriginal: input.phone.trim(),
    phoneNormalized: phone.normalized,
    phoneLastFour: phone.lastFour,
    productKey: product.key,
    productDisplayName,
    shopifyProductId: resolvedProduct.productId || product.shopifyProductId || "",
    shopifyVariantId: resolvedProduct.variantId || product.shopifyVariantId || "",
    productPath: resolvedProduct.productPath || product.productPath,
    shippingRegion: input.shippingRegion,
    productDiscountCode: productCode,
    productDiscountShopifyId,
    shippingDiscountCode: "",
    shippingDiscountShopifyId: "",
    customerLink: buildManualOrderCustomerLink(productCode, resolvedProduct.productPath || product.productPath),
    status: "active",
    shopifyOrderId: "",
    shopifyOrderName: "",
    createdAt: now,
    updatedAt: now,
    usedAt: "",
  };
}

export async function deactivateManualOrderDiscount(discountId: string) {
  if (!discountId) return;
  const domain = shopDomain();
  if (!domain) throw new Error("SHOPIFY_SHOP_DOMAIN is missing in Vercel.");
  const result = await shopifyGraphql<{
    data?: { discountCodeDeactivate?: { userErrors?: DiscountUserError[] } };
    errors?: { message?: string }[];
  }>(domain, `
    mutation DeactivateManualDiscount($id: ID!) {
      discountCodeDeactivate(id: $id) {
        codeDiscountNode { id }
        userErrors { field message code }
      }
    }
  `, { id: discountId });
  if (result?.errors?.length) throw new Error(result.errors.map((error) => error.message).filter(Boolean).join(" "));
  const errors = result?.data?.discountCodeDeactivate?.userErrors ?? [];
  if (errors.length) throw new Error(userErrorMessage(errors, "Shopify rejected the discount cancellation."));
}
