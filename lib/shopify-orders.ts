let cachedShopifyToken: { token: string; expiresAt: number } | null = null;

const UPLOAD_LIFT_KEY = process.env.SHOPIFY_UPLOAD_LIFT_METAFIELD_KEY ?? "upload_lift_form_data";
const UPLOAD_LIFT_NAMESPACE = process.env.SHOPIFY_UPLOAD_LIFT_METAFIELD_NAMESPACE ?? "custom";

const ORDER_SELECTION = `
  id
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
    }
  }
  metafields(first: 50) {
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

function shopDomain(request?: Request, payload: Record<string, unknown> = {}) {
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

async function shopifyGraphql<T>(domain: string, query: string, variables: Record<string, unknown>) {
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

  return result?.data?.order ? normalizeGraphqlOrder(result.data.order) : payload;
}

export async function fetchShopifyOrderByNumber(orderNumber: string, request?: Request): Promise<Record<string, unknown> | null> {
  const cleanNumber = cleanShopifyOrderNumber(orderNumber);
  const domain = shopDomain(request);
  if (!domain || !cleanNumber) return null;

  const result = await shopifyGraphql<{ data?: { orders?: { nodes?: Record<string, unknown>[] } } }>(domain, `
    query OrderForFulfilmentRefresh($query: String!, $uploadLiftKey: String!, $uploadLiftNamespace: String!) {
      orders(first: 1, query: $query, sortKey: CREATED_AT, reverse: true) {
        nodes {
          ${ORDER_SELECTION}
        }
      }
    }
  `, { query: `name:#${cleanNumber}`, uploadLiftKey: UPLOAD_LIFT_KEY, uploadLiftNamespace: UPLOAD_LIFT_NAMESPACE });

  const order = result?.data?.orders?.nodes?.[0];
  return order ? normalizeGraphqlOrder(order) : null;
}

export async function fetchShopifyOrderWithMetafieldRetry(payload: Record<string, unknown>, request?: Request) {
  let fullOrder = await fetchShopifyOrder(payload, request);
  if (shopifyMetafieldValue(fullOrder) || shopifyMetafieldValue(payload)) return fullOrder;

  // Upload Lift can write order metafields moments after Shopify fires orders/create.
  for (const delay of [1500, 3000, 5000]) {
    await wait(delay);
    fullOrder = await fetchShopifyOrder(payload, request);
    if (shopifyMetafieldValue(fullOrder)) return fullOrder;
  }
  return fullOrder;
}

export async function fetchShopifyOrderByNumberWithMetafieldRetry(orderNumber: string, request?: Request) {
  let fullOrder = await fetchShopifyOrderByNumber(orderNumber, request);
  if (!fullOrder || shopifyMetafieldValue(fullOrder)) return fullOrder;

  for (const delay of [1500, 3000, 5000]) {
    await wait(delay);
    fullOrder = await fetchShopifyOrderByNumber(orderNumber, request);
    if (!fullOrder || shopifyMetafieldValue(fullOrder)) return fullOrder;
  }
  return fullOrder;
}
