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
      id
      name
      title
      variantTitle
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

/** Matches the Liquid formula used by the existing Shopify Flow workflow. */
export function flowCertificateCode(orderNumber: string, orderCreatedAt: string, lineItemId: string) {
  const prefix = cleanShopifyOrderNumber(orderNumber);
  const timestamp = Number.isFinite(Date.parse(orderCreatedAt))
    ? String(Math.floor(Date.parse(orderCreatedAt) / 1000)).slice(-4)
    : "";
  const itemSuffix = String(lineItemId).slice(-3);
  return `${prefix}${timestamp}${itemSuffix}`;
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
  certificate?: string;
  plushBackgroundBottom?: string;
};

const CERTIFICATE_MEDIA_BY_CHARACTER: Array<[RegExp, string]> = [
  [/tootsie/i, "gid://shopify/MediaImage/24492659114055"],
  [/dragon warrior/i, "gid://shopify/MediaImage/24492659179591"],
  [/billy/i, "gid://shopify/MediaImage/24492659081287"],
  [/hunnie/i, "gid://shopify/MediaImage/24492659048519"],
  [/piggy/i, "gid://shopify/MediaImage/24492659015751"],
];

const PLUSH_BACKGROUND_MEDIA: Array<[number, string]> = [
  [140, "gid://shopify/MediaImage/24567099359303"], [175, "gid://shopify/MediaImage/24567124492359"],
  [210, "gid://shopify/MediaImage/24567124688967"], [245, "gid://shopify/MediaImage/24567124590663"],
  [280, "gid://shopify/MediaImage/24567124525127"], [315, "gid://shopify/MediaImage/24567124623431"],
  [350, "gid://shopify/MediaImage/24567124459591"], [385, "gid://shopify/MediaImage/24567124557895"],
  [420, "gid://shopify/MediaImage/24567124918343"], [455, "gid://shopify/MediaImage/24567124656199"],
  [490, "gid://shopify/MediaImage/24567124820039"], [525, "gid://shopify/MediaImage/24567124754503"],
  [560, "gid://shopify/MediaImage/24567124951111"], [595, "gid://shopify/MediaImage/24567124885575"],
  [630, "gid://shopify/MediaImage/24567124852807"], [665, "gid://shopify/MediaImage/24567125147719"],
  [700, "gid://shopify/MediaImage/24567125246023"], [735, "gid://shopify/MediaImage/24567124983879"],
  [770, "gid://shopify/MediaImage/24567125278791"], [805, "gid://shopify/MediaImage/24567124787271"],
  [840, "gid://shopify/MediaImage/24567125311559"], [875, "gid://shopify/MediaImage/24567125016647"],
  [910, "gid://shopify/MediaImage/24567125049415"], [945, "gid://shopify/MediaImage/24567125114951"],
  [980, "gid://shopify/MediaImage/24567125082183"], [1015, "gid://shopify/MediaImage/24567125213255"],
  [1050, "gid://shopify/MediaImage/24567125180487"],
];

export function certificateMediaForLineItem(title: string, variantTitle = "") {
  const value = `${title} ${variantTitle}`;
  return CERTIFICATE_MEDIA_BY_CHARACTER.find(([pattern]) => pattern.test(value))?.[1];
}

export function plushBackgroundForMeaningfulNote(note: string) {
  if (!note) return undefined;
  // Count user-visible Unicode characters, not UTF-16 code units, so emoji
  // select the same background band as Shopify Flow's string-size rule.
  const characterCount = Array.from(note).length;
  return PLUSH_BACKGROUND_MEDIA.find(([maximum]) => characterCount <= maximum)?.[1]
    // The Flow table ends at 1,050 characters. Keep using its final design
    // for a longer note instead of leaving the certificate background blank.
    ?? PLUSH_BACKGROUND_MEDIA.at(-1)?.[1];
}

function flowCapitalize(value: string | undefined) {
  const source = value || "";
  return source ? `${source[0].toUpperCase()}${source.slice(1).toLowerCase()}` : "";
}

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

export type CertificateMetaobjectMatch = {
  id: string;
  code: string;
  handle: string;
};

type CertificateMetaobjectsQuery = {
  data?: {
    metaobjects?: {
      nodes?: Array<{ id?: string; handle?: string; fields?: Array<{ key?: string; value?: string }> }>;
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    } | null;
  };
};

type CertificateMetaobjectsPage = NonNullable<NonNullable<CertificateMetaobjectsQuery["data"]>["metaobjects"]>;

function certificateHandle(code: string) {
  return code.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 255);
}

type CertificateDefinitionField = { key?: string; name?: string };

/**
 * Shopify keeps a field's API key even if its display label is later edited.
 * Read the live definition before writing an entry so the fulfilment app uses
 * that persisted key (rather than assuming it is the label converted to
 * snake_case). This is particularly important for the plushie image field.
 */
function certificateFields(input: CertificateMetaobjectInput, definitionFields?: CertificateDefinitionField[]) {
  const values: [string, string | undefined][] = [
    ["code", input.code], ["order_number", input.orderNumber ? `#${cleanShopifyOrderNumber(input.orderNumber)}` : ""],
    ["created_at", input.createdAt], ["plush_details", input.plushDetails], ["certificate", input.certificate],
    ["id_name", input.idName?.toUpperCase()], ["gender", input.gender], ["born_on", input.bornOn], ["birthplace", input.birthplace],
    ["favourite_person", flowCapitalize(input.favouritePerson)], ["belongs_to", flowCapitalize(input.belongsTo)],
    ["meaningful_note", input.meaningfulNote], ["plush_background_bottom", input.plushBackgroundBottom],
    ["meaningful_message", input.meaningfulMessage],
  ];
  if (!definitionFields?.length) {
    return values.filter(([, value]) => value !== undefined).map(([key, value]) => ({ key, value: value || "" }));
  }

  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return values.flatMap(([expectedKey, value]) => {
    if (value === undefined) return [];
    const expected = normalise(expectedKey);
    const field = definitionFields.find((candidate) =>
      normalise(candidate.key || "") === expected || normalise(candidate.name || "") === expected,
    );
    return field?.key ? [{ key: field.key, value: value || "" }] : [];
  });
}

async function certificateFieldsForLiveDefinition(domain: string, input: CertificateMetaobjectInput) {
  const result = await shopifyGraphql<{
    data?: { metaobjectDefinitionByType?: { fieldDefinitions?: CertificateDefinitionField[] } | null };
  }>(domain, `
    query CertificateMetaobjectDefinition($type: String!) {
      metaobjectDefinitionByType(type: $type) {
        fieldDefinitions { key name }
      }
    }
  `, { type: certificateMetaobjectType });
  const definitionFields = result?.data?.metaobjectDefinitionByType?.fieldDefinitions;
  return certificateFields(input, definitionFields);
}

async function certificateHandleExists(domain: string, handle: string) {
  const result = await shopifyGraphql<{ data?: { metaobjectByHandle?: { id?: string } | null } }>(domain, `
    query CertificateMetaobjectByHandle($handle: MetaobjectHandleInput!) {
      metaobjectByHandle(handle: $handle) { id }
    }
  `, { handle: { type: certificateMetaobjectType, handle } });
  return Boolean(result?.data?.metaobjectByHandle?.id);
}

export async function createCertificateMetaobject(input: Omit<CertificateMetaobjectInput, "code"> & { code?: string }) {
  // Meaningful Fulfilment owns certificate creation. Set this explicitly to
  // false only while a legacy Shopify Flow still creates the same entry.
  if (process.env.CERTIFICATE_AUTOMATION_ENABLED === "false") return null;
  const domain = shopDomain();
  const prefix = cleanShopifyOrderNumber(input.orderNumber);
  if (!domain || !prefix) throw new Error("Shopify certificate automation is not configured.");
  if (input.code) {
    const code = input.code;
    const handle = certificateHandle(code);
    const fields = await certificateFieldsForLiveDefinition(domain, { ...input, code });
    const result = await shopifyGraphql<{ data?: { metaobjectUpsert?: { metaobject?: { id?: string; handle?: string }; userErrors?: { message?: string }[] } } }>(domain, `
      mutation CreateCertificateMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject { id handle }
          userErrors { message }
        }
      }
    `, { handle: { type: certificateMetaobjectType, handle }, metaobject: { fields, capabilities: { publishable: { status: "ACTIVE" } } } });
    const payload = result?.data?.metaobjectUpsert;
    if (payload?.userErrors?.length) {
      throw new Error(payload.userErrors.map((error) => error.message).filter(Boolean).join(" ") || "Shopify rejected the certificate metaobject.");
    }
    if (payload?.metaobject?.id) return { code, id: payload.metaobject.id, handle: payload.metaobject.handle || handle };
    throw new Error("Could not create the certificate metaobject.");
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = `${prefix}${randomInt(1_000_000, 10_000_000)}`;
    const handle = certificateHandle(code);
    if (await certificateHandleExists(domain, handle)) continue;
    const fields = await certificateFieldsForLiveDefinition(domain, { ...input, code });
    const result = await shopifyGraphql<{ data?: { metaobjectUpsert?: { metaobject?: { id?: string; handle?: string }; userErrors?: { message?: string }[] } } }>(domain, `
      mutation CreateCertificateMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject { id handle }
          userErrors { message }
        }
      }
    `, { handle: { type: certificateMetaobjectType, handle }, metaobject: { fields, capabilities: { publishable: { status: "ACTIVE" } } } });
    const payload = result?.data?.metaobjectUpsert;
    if (payload?.userErrors?.length) throw new Error(payload.userErrors.map((error) => error.message).filter(Boolean).join(" ") || "Shopify rejected the certificate metaobject.");
    if (payload?.metaobject?.id) return { code, id: payload.metaobject.id, handle: payload.metaobject.handle || handle };
  }
  throw new Error("Could not generate a unique certificate code.");
}

export async function updateCertificateMetaobject(input: CertificateMetaobjectInput) {
  const domain = shopDomain();
  const code = input.code || "";
  if (!domain || !code) return false;
  const fields = await certificateFieldsForLiveDefinition(domain, input);
  const result = await shopifyGraphql<{ data?: { metaobjectUpsert?: { metaobject?: { id?: string; handle?: string }; userErrors?: { message?: string }[] } } }>(domain, `
    mutation UpdateCertificateMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
      metaobjectUpsert(handle: $handle, metaobject: $metaobject) { metaobject { id handle } userErrors { message } }
    }
  `, {
    handle: { type: certificateMetaobjectType, handle: certificateHandle(code) },
    metaobject: { fields, capabilities: { publishable: { status: "ACTIVE" } } },
  });
  const payload = result?.data?.metaobjectUpsert;
  if (payload?.userErrors?.length) {
    throw new Error(payload.userErrors.map((error) => error.message).filter(Boolean).join(" ") || "Shopify rejected the certificate update.");
  }
  return Boolean(payload?.metaobject?.id);
}

/**
 * Shopify Flow creates Version 1 certificates independently of this app.
 * Locate that entry by its order number so a later secure customisation can
 * update the same certificate instead of creating a second one.
 */
export async function certificateMetaobjectForOrder(orderNumber: string) {
  const domain = shopDomain();
  const expectedOrderNumber = cleanShopifyOrderNumber(orderNumber);
  if (!domain || !expectedOrderNumber) return null;

  let after: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const result: CertificateMetaobjectsQuery | null = await shopifyGraphql<CertificateMetaobjectsQuery>(domain, `
      query CertificateMetaobjectsForOrder($type: String!, $after: String) {
        metaobjects(type: $type, first: 250, after: $after) {
          nodes { id handle fields { key value } }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, { type: certificateMetaobjectType, after });
    const metaobjects: CertificateMetaobjectsPage | null = result?.data?.metaobjects ?? null;
    for (const entry of metaobjects?.nodes ?? []) {
      const fields = new Map((entry.fields ?? []).map((field) => [field.key || "", field.value || ""]));
      if (cleanShopifyOrderNumber(fields.get("order_number") || "") !== expectedOrderNumber) continue;
      const code = fields.get("code") || "";
      if (entry.id && entry.handle && code) return { id: entry.id, handle: entry.handle, code } satisfies CertificateMetaobjectMatch;
    }
    if (!metaobjects?.pageInfo?.hasNextPage || !metaobjects.pageInfo.endCursor) break;
    after = metaobjects.pageInfo.endCursor;
  }
  return null;
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
