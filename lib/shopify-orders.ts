import { randomInt } from "node:crypto";

let cachedShopifyToken: { token: string; expiresAt: number } | null = null;

const UPLOAD_LIFT_KEY = process.env.SHOPIFY_UPLOAD_LIFT_METAFIELD_KEY ?? "upload_lift_form_data";
const UPLOAD_LIFT_NAMESPACE = process.env.SHOPIFY_UPLOAD_LIFT_METAFIELD_NAMESPACE ?? "custom";

const ORDER_SELECTION = `
  id
  legacyResourceId
  name
  createdAt
  processedAt
  email
  phone
  currencyCode
  note
  currentSubtotalPriceSet { shopMoney { amount currencyCode } }
  currentTotalPriceSet { shopMoney { amount currencyCode } }
  currentTotalDiscountsSet { shopMoney { amount currencyCode } }
  totalShippingPriceSet { shopMoney { amount currencyCode } }
  totalRefundedSet { shopMoney { amount currencyCode } }
  totalOutstandingSet { shopMoney { amount currencyCode } }
  paymentGatewayNames
  discountApplications(first: 10) {
    nodes {
      ... on DiscountCodeApplication { code title }
      ... on ManualDiscountApplication { title }
      ... on ScriptDiscountApplication { title }
      ... on AutomaticDiscountApplication { title }
    }
  }
  tags
  shippingAddress { name address1 address2 city province zip country phone }
  billingAddress { name address1 address2 city province zip country phone }
  shippingLine { title }
  uploadLiftFormData: metafield(namespace: $uploadLiftNamespace, key: $uploadLiftKey) { value }
  lineItems(first: 50) {
    nodes {
      name
      title
      quantity
      originalUnitPriceSet { shopMoney { amount currencyCode } }
      totalDiscountSet { shopMoney { amount currencyCode } }
      customAttributes { key value }
    }
  }
  metafields(first: 250) {
    nodes { namespace key value }
  }
`;

export function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function textValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

export function cleanShopifyOrderNumber(value: string) {
  return value.replace(/[^0-9]/g, "");
}

export function adminGraphqlOrderId(payload: Record<string, unknown>) {
  const direct = textValue(payload.admin_graphql_api_id) || textValue(payload.id);
  if (!direct) return "";
  return direct.startsWith("gid://") ? direct : `gid://shopify/Order/${direct}`;
}

export function shopDomain(request?: Request, payload: Record<string, unknown> = {}) {
  const fromHeader = request?.headers.get("x-shopify-shop-domain");
  const fromEnv = process.env.SHOPIFY_SHOP_DOMAIN;
  const fromPayload = textValue(payload.shop_domain);
  return (fromHeader || fromEnv || fromPayload || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function getShopifyAccessToken(domain: string) {
  const fixedToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (fixedToken) return fixedToken;

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret || !domain) return "";

  const now = Date.now();
  if (cachedShopifyToken && cachedShopifyToken.expiresAt > now + 60_000) {
    return cachedShopifyToken.token;
  }

  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) return "";

  const result = await response.json() as { access_token?: string; expires_in?: number };
  const token = textValue(result.access_token);
  if (!token) return "";

  cachedShopifyToken = {
    token,
    expiresAt: now + Math.max(1, Number(result.expires_in ?? 86_400)) * 1000,
  };
  return token;
}

export function shopifyMetafieldValue(payload: Record<string, unknown>) {
  const direct = objectValue(payload.uploadLiftFormData);
  const directValue = textValue(direct.value);
  if (directValue) return directValue;

  const metafields = payload.metafields;
  const nodes = objectValue(metafields).nodes;
  const values = Array.isArray(nodes) ? nodes : Array.isArray(metafields) ? metafields : [];
  for (const item of values) {
    const field = objectValue(item);
    if (textValue(field.key) === UPLOAD_LIFT_KEY) return textValue(field.value);
  }
  return textValue(payload[UPLOAD_LIFT_KEY]);
}

function normalizeGraphqlOrder(order: Record<string, unknown>): Record<string, unknown> {
  const lineItems = objectValue(order.lineItems).nodes;
  const metafields = objectValue(order.metafields).nodes;
  return {
    ...order,
    lineItems: Array.isArray(lineItems) ? lineItems : [],
    metafields: Array.isArray(metafields) ? metafields : [],
  };
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function shopifyGraphql<T>(domain: string, query: string, variables: Record<string, unknown>) {
  const token = await getShopifyAccessToken(domain);
  if (!token || !domain) return null;

  const apiVersion = process.env.SHOPIFY_API_VERSION ?? "2026-04";
  const response = await fetch(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

export async function setShopifyOrderMetafield(orderId: string, value: string) {
  const domain = shopDomain();
  if (!domain || !orderId) return false;
  const result = await shopifyGraphql<{ data?: { metafieldsSet?: { userErrors?: { message?: string }[] } } }>(domain, `
    mutation SaveDeferredCustomisation($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { message }
      }
    }
  `, {
    metafields: [{
      ownerId: orderId,
      namespace: UPLOAD_LIFT_NAMESPACE,
      key: UPLOAD_LIFT_KEY,
      type: "multi_line_text_field",
      value,
    }],
  });
  return !(result?.data?.metafieldsSet?.userErrors?.length);
}

export type CertificateMetaobjectInput = {
  orderNumber: string;
  createdAt: string;
  plushDetails?: string;
  code?: string;
  idName?: string;
  gender?: string;
  bornOn?: string;
  birthplace?: string;
  favouritePerson?: string;
  belongsTo?: string;
  meaningfulNote?: string;
  meaningfulMessage?: string;
};

/**
 * Upload Lift stores the form as a text metafield.  Keeping this reader here
 * lets the fulfilment app populate the certificate directly, without relying
 * on a separate Shopify Flow to translate the same data a second time.
 */
export function uploadLiftCertificateFields(raw: string): Omit<CertificateMetaobjectInput, "orderNumber" | "createdAt" | "plushDetails" | "code"> {
  const source = raw.trim();
  if (!source) return {};

  const fromJson = (() => {
    try {
      const parsed = JSON.parse(source) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  })();

  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const jsonValue = (labels: string[]) => {
    const expected = labels.map(normalise);
    for (const [key, value] of Object.entries(fromJson)) {
      if (expected.includes(normalise(key)) && (typeof value === "string" || typeof value === "number")) return String(value).trim();
    }
    return "";
  };
  const textValueFor = (labels: string[]) => {
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = source.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*[:\\-]\\s*([^\\r\\n]*)`, "im"));
      if (match?.[1]?.trim()) return match[1].trim();
    }
    return "";
  };
  const read = (...labels: string[]) => jsonValue(labels) || textValueFor(labels);

  return {
    idName: read("Name", "Plushie's Name", "Plushie Name"),
    gender: read("Gender", "Plushie's Gender", "Plushie Gender"),
    bornOn: read("Born On", "Birthday", "Plushie's Birthday", "Plushie's Birth Date", "Birth Date"),
    birthplace: read("Birthplace", "Birth Place", "Plushie's Birth Place", "Plushie Birth Place"),
    favouritePerson: read("Favourite Person", "Favorite Person", "Plushie's Favourite Person", "Plushie's Favorite Person"),
    belongsTo: read("Belongs To", "Plushie Belongs To", "Plushie's Belongs To"),
    meaningfulNote: read("Meaningful Note"),
    meaningfulMessage: read("Meaningful Message", "Voice Message", "Voice"),
  };
}

const certificateMetaobjectType = process.env.SHOPIFY_CERTIFICATE_METAOBJECT_TYPE || "version_1_certs";

function certificateHandle(code: string) {
  return code.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 255);
}

function certificateFields(input: CertificateMetaobjectInput) {
  const values: [string, string | undefined][] = [
    ["code", input.code], ["order_number", input.orderNumber ? `#${cleanShopifyOrderNumber(input.orderNumber)}` : ""],
    ["created_at", input.createdAt], ["plush_details", input.plushDetails], ["id_name", input.idName],
    ["gender", input.gender], ["born_on", input.bornOn], ["birthplace", input.birthplace],
    ["favourite_person", input.favouritePerson], ["belongs_to", input.belongsTo],
    ["meaningful_note", input.meaningfulNote], ["meaningful_message", input.meaningfulMessage],
  ];
  return values.filter(([, value]) => value !== undefined).map(([key, value]) => ({ key, value: value || "" }));
}

async function certificateHandleExists(domain: string, handle: string) {
  const result = await shopifyGraphql<{ data?: { metaobjectByHandle?: { id?: string } | null } }>(domain, `
    query CertificateMetaobjectByHandle($handle: MetaobjectHandleInput!) {
      metaobjectByHandle(handle: $handle) { id }
    }
  `, { handle: { type: certificateMetaobjectType, handle } });
  return Boolean(result?.data?.metaobjectByHandle?.id);
}

export async function createCertificateMetaobject(input: Omit<CertificateMetaobjectInput, "code">) {
  if (process.env.CERTIFICATE_AUTOMATION_ENABLED !== "true") return null;
  const domain = shopDomain();
  const prefix = cleanShopifyOrderNumber(input.orderNumber);
  if (!domain || !prefix) throw new Error("Shopify certificate automation is not configured.");
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = `${prefix}${randomInt(1_000_000, 10_000_000)}`;
    const handle = certificateHandle(code);
    if (await certificateHandleExists(domain, handle)) continue;
    const result = await shopifyGraphql<{ data?: { metaobjectUpsert?: { metaobject?: { id?: string; handle?: string }; userErrors?: { message?: string }[] } } }>(domain, `
      mutation CreateCertificateMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject { id handle }
          userErrors { message }
        }
      }
    `, { handle: { type: certificateMetaobjectType, handle }, metaobject: { fields: certificateFields({ ...input, code }) } });
    const payload = result?.data?.metaobjectUpsert;
    if (payload?.metaobject?.id) return { code, id: payload.metaobject.id, handle: payload.metaobject.handle || handle };
  }
  throw new Error("Could not generate a unique certificate code.");
}

export async function updateCertificateMetaobject(input: CertificateMetaobjectInput) {
  const domain = shopDomain();
  const code = input.code || "";
  if (!domain || !code) return false;
  const result = await shopifyGraphql<{ data?: { metaobjectUpsert?: { userErrors?: { message?: string }[] } } }>(domain, `
    mutation UpdateCertificateMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
      metaobjectUpsert(handle: $handle, metaobject: $metaobject) { userErrors { message } }
    }
  `, {
    handle: { type: certificateMetaobjectType, handle: certificateHandle(code) },
    metaobject: { fields: certificateFields(input) },
  });
  return !result?.data?.metaobjectUpsert?.userErrors?.length;
}

async function shopifyRest<T>(domain: string, path: string) {
  const token = await getShopifyAccessToken(domain);
  if (!token || !domain) return null;

  const apiVersion = process.env.SHOPIFY_API_VERSION ?? "2026-04";
  const response = await fetch(`https://${domain}/admin/api/${apiVersion}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
  });

  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

async function fetchOrderMetafieldsByRest(domain: string, order: Record<string, unknown>) {
  const legacyId = textValue(order.legacyResourceId) || textValue(order.legacy_resource_id) || textValue(order.id).replace(/\D/g, "");
  if (!legacyId) return [];
  const result = await shopifyRest<{ metafields?: Record<string, unknown>[] }>(domain, `/orders/${legacyId}/metafields.json?limit=250`);
  return result?.metafields ?? [];
}

async function withRestMetafieldsIfMissing(domain: string, order: Record<string, unknown>) {
  if (shopifyMetafieldValue(order)) return order;
  const metafields = await fetchOrderMetafieldsByRest(domain, order);
  return metafields.length ? { ...order, metafields } : order;
}

async function fetchShopifyOrderByNumberRest(cleanNumber: string, domain: string) {
  for (const name of [`#${cleanNumber}`, cleanNumber]) {
    const query = new URLSearchParams({
      name,
      status: "any",
      limit: "5",
    });
    const result = await shopifyRest<{ orders?: Record<string, unknown>[] }>(domain, `/orders.json?${query}`);
    const order = result?.orders?.find((item) => cleanShopifyOrderNumber(textValue(item.name) || textValue(item.order_number)) === cleanNumber)
      ?? result?.orders?.[0];
    if (order) {
      const fullOrder = await fetchShopifyOrder(order);
      if (shopifyMetafieldValue(fullOrder)) return fullOrder;

      const orderId = textValue(order.id);
      const metafields = orderId
        ? await shopifyRest<{ metafields?: Record<string, unknown>[] }>(domain, `/orders/${orderId}/metafields.json?limit=50`)
        : null;
      return {
        ...order,
        metafields: metafields?.metafields ?? [],
      };
    }
  }
  return null;
}

export async function fetchShopifyOrder(payload: Record<string, unknown>, request?: Request): Promise<Record<string, unknown>> {
  const domain = shopDomain(request, payload);
  const orderId = adminGraphqlOrderId(payload);
  if (!domain || !orderId) return payload;

  const result = await shopifyGraphql<{ data?: { order?: Record<string, unknown> } }>(domain, `
    query OrderForFulfilment($id: ID!, $uploadLiftKey: String!, $uploadLiftNamespace: String!) {
      order(id: $id) {
        ${ORDER_SELECTION}
      }
    }
  `, { id: orderId, uploadLiftKey: UPLOAD_LIFT_KEY, uploadLiftNamespace: UPLOAD_LIFT_NAMESPACE });

  return result?.data?.order ? withRestMetafieldsIfMissing(domain, normalizeGraphqlOrder(result.data.order)) : payload;
}

export async function fetchShopifyOrderByNumber(orderNumber: string, request?: Request): Promise<Record<string, unknown> | null> {
  const cleanNumber = cleanShopifyOrderNumber(orderNumber);
  const domain = shopDomain(request);
  if (!domain || !cleanNumber) return null;

  const queries = [`name:${cleanNumber}`, `name:#${cleanNumber}`, `#${cleanNumber}`, cleanNumber];
  for (const query of queries) {
    const result = await shopifyGraphql<{ data?: { orders?: { nodes?: Record<string, unknown>[] } } }>(domain, `
      query OrderForFulfilmentRefresh($query: String!, $uploadLiftKey: String!, $uploadLiftNamespace: String!) {
        orders(first: 5, query: $query, sortKey: CREATED_AT, reverse: true) {
          nodes {
            ${ORDER_SELECTION}
          }
        }
      }
    `, { query, uploadLiftKey: UPLOAD_LIFT_KEY, uploadLiftNamespace: UPLOAD_LIFT_NAMESPACE });

    const order = result?.data?.orders?.nodes?.find((item) => cleanShopifyOrderNumber(textValue(item.name)) === cleanNumber)
      ?? result?.data?.orders?.nodes?.[0];
    if (order) return withRestMetafieldsIfMissing(domain, normalizeGraphqlOrder(order));
  }

  return fetchShopifyOrderByNumberRest(cleanNumber, domain);
}

export async function fetchShopifyOrdersCreatedSince(date: string, request?: Request) {
  const domain = shopDomain(request);
  if (!domain || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  const result = await shopifyGraphql<{ data?: { orders?: { nodes?: Record<string, unknown>[] } } }>(domain, `
    query OrdersForFulfilmentCatchUp($query: String!, $uploadLiftKey: String!, $uploadLiftNamespace: String!) {
      orders(first: 250, query: $query, sortKey: CREATED_AT, reverse: true) {
        nodes {
          ${ORDER_SELECTION}
        }
      }
    }
  `, {
    // Fetch the recent set first. Shopify's date search can omit newly-created
    // orders while indexes are catching up, so the caller filters createdAt.
    query: "status:any",
    uploadLiftKey: UPLOAD_LIFT_KEY,
    uploadLiftNamespace: UPLOAD_LIFT_NAMESPACE,
  });

  return Promise.all((result?.data?.orders?.nodes ?? []).map(async (order) => (
    withRestMetafieldsIfMissing(domain, normalizeGraphqlOrder(order))
  )));
}

export async function fetchShopifyOrderWithMetafieldRetry(payload: Record<string, unknown>, request?: Request) {
  let fullOrder = await fetchShopifyOrder(payload, request);
  if (shopifyMetafieldValue(fullOrder) || shopifyMetafieldValue(payload)) return fullOrder;

  // Upload Lift can write order metafields moments after Shopify fires orders/create.
  const orderNumber = cleanShopifyOrderNumber(textValue(fullOrder.name) || textValue(payload.name) || textValue(payload.order_number));
  for (const delay of [2000, 5000, 10000, 15000]) {
    await wait(delay);
    fullOrder = await fetchShopifyOrder(payload, request);
    if (shopifyMetafieldValue(fullOrder)) return fullOrder;
    if (orderNumber) {
      const refreshedByNumber = await fetchShopifyOrderByNumber(orderNumber, request);
      if (refreshedByNumber && shopifyMetafieldValue(refreshedByNumber)) return refreshedByNumber;
    }
  }
  return fullOrder;
}

export async function fetchShopifyOrderByNumberWithMetafieldRetry(orderNumber: string, request?: Request) {
  let fullOrder = await fetchShopifyOrderByNumber(orderNumber, request);
  if (!fullOrder || shopifyMetafieldValue(fullOrder)) return fullOrder;

  for (const delay of [2000, 5000, 10000, 15000]) {
    await wait(delay);
    fullOrder = await fetchShopifyOrderByNumber(orderNumber, request);
    if (!fullOrder || shopifyMetafieldValue(fullOrder)) return fullOrder;
  }
  return fullOrder;
}
