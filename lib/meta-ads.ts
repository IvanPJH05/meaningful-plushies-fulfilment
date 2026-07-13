import type { MetaAdsEnvironment, MetaAdsInsight, MetaAdsSummary } from "./types";

type MetaActionStat = {
  action_type?: string;
  value?: string;
};

type MetaInsightRow = {
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: MetaActionStat[];
  action_values?: MetaActionStat[];
  purchase_roas?: MetaActionStat[];
  cost_per_action_type?: MetaActionStat[];
  date_start?: string;
  date_stop?: string;
};

const purchaseActionTypes = new Set([
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_conversion.purchase",
  "web_in_store_purchase",
]);

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function sumActionValues(actions: MetaActionStat[] | undefined) {
  return (actions ?? []).reduce((sum, action) => {
    if (!action.action_type || !purchaseActionTypes.has(action.action_type)) return sum;
    return sum + numberValue(action.value);
  }, 0);
}

function firstPurchaseMetric(actions: MetaActionStat[] | undefined) {
  const match = (actions ?? []).find((action) => action.action_type && purchaseActionTypes.has(action.action_type));
  return numberValue(match?.value);
}

function metaAdsCredentials() {
  const cleanEnvValue = (value: string | undefined) => {
    const trimmed = (value ?? "").trim();
    if (!trimmed || trimmed === "\"\"" || trimmed === "''") return "";
    return trimmed.replace(/^["']|["']$/g, "").trim();
  };
  const rawAdAccountId = cleanEnvValue(process.env.META_AD_ACCOUNT_ID);
  const accessToken = cleanEnvValue(process.env.META_ADS_ACCESS_TOKEN)
    || cleanEnvValue(process.env.META_MARKETING_ACCESS_TOKEN);
  const adAccountId = rawAdAccountId && rawAdAccountId.startsWith("act_") ? rawAdAccountId : rawAdAccountId ? `act_${rawAdAccountId}` : "";
  return {
    adAccountId,
    accessToken,
    graphVersion: process.env.META_GRAPH_API_VERSION ?? "v20.0",
  };
}

export function metaAdsEnvironmentStatus(): MetaAdsEnvironment {
  const { adAccountId, accessToken, graphVersion } = metaAdsCredentials();
  return {
    adAccountConfigured: Boolean(adAccountId),
    tokenConfigured: Boolean(accessToken),
    tokenMasked: accessToken ? `${accessToken.slice(0, 6)}...${accessToken.slice(-4)}` : "",
    graphVersion,
  };
}

function normalizeInsight(row: MetaInsightRow): MetaAdsInsight {
  const spend = money(numberValue(row.spend));
  const impressions = numberValue(row.impressions);
  const clicks = numberValue(row.clicks);
  const linkClicks = numberValue(row.inline_link_clicks);
  const purchases = sumActionValues(row.actions);
  const revenue = money(sumActionValues(row.action_values));
  const roas = spend > 0 ? revenue / spend : firstPurchaseMetric(row.purchase_roas);
  const cpa = purchases > 0 ? spend / purchases : firstPurchaseMetric(row.cost_per_action_type);
  return {
    adId: row.ad_id ?? "",
    adName: row.ad_name ?? "Unnamed ad",
    adsetName: row.adset_name ?? "",
    campaignName: row.campaign_name ?? "",
    spend,
    impressions,
    reach: numberValue(row.reach),
    clicks,
    linkClicks,
    purchases,
    revenue,
    roas: Number.isFinite(roas) ? roas : 0,
    cpa: Number.isFinite(cpa) ? cpa : 0,
    ctr: impressions > 0 ? clicks / impressions : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    dateStart: row.date_start ?? "",
    dateStop: row.date_stop ?? "",
  };
}

export function summarizeMetaAdsInsights(insights: MetaAdsInsight[]): MetaAdsSummary {
  const total = insights.reduce((summary, row) => ({
    spend: summary.spend + row.spend,
    purchases: summary.purchases + row.purchases,
    revenue: summary.revenue + row.revenue,
    impressions: summary.impressions + row.impressions,
    clicks: summary.clicks + row.clicks,
    linkClicks: summary.linkClicks + row.linkClicks,
  }), { spend: 0, purchases: 0, revenue: 0, impressions: 0, clicks: 0, linkClicks: 0 });
  return {
    ...total,
    spend: money(total.spend),
    revenue: money(total.revenue),
    roas: total.spend > 0 ? total.revenue / total.spend : 0,
    cpa: total.purchases > 0 ? total.spend / total.purchases : 0,
  };
}

export async function fetchMetaAdsInsights(from: string, to: string) {
  const { adAccountId, accessToken, graphVersion } = metaAdsCredentials();
  if (!adAccountId || !accessToken) {
    return {
      environment: metaAdsEnvironmentStatus(),
      insights: [] as MetaAdsInsight[],
      summary: summarizeMetaAdsInsights([]),
      configured: false,
    };
  }

  const params = new URLSearchParams({
    level: "ad",
    time_increment: "all_days",
    fields: [
      "ad_id",
      "ad_name",
      "adset_name",
      "campaign_name",
      "spend",
      "impressions",
      "reach",
      "clicks",
      "inline_link_clicks",
      "actions",
      "action_values",
      "purchase_roas",
      "cost_per_action_type",
      "date_start",
      "date_stop",
    ].join(","),
    time_range: JSON.stringify({ since: from, until: to }),
    access_token: accessToken,
    limit: "100",
  });
  const url = `https://graph.facebook.com/${graphVersion}/${adAccountId}/insights?${params.toString()}`;
  const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as { data?: MetaInsightRow[]; error?: { message?: string; code?: number; type?: string } };
  if (!response.ok) {
    const message = body.error?.message || "Meta ads insights could not be loaded.";
    throw new Error(message);
  }
  const insights = (body.data ?? []).map(normalizeInsight).sort((a, b) => b.spend - a.spend);
  return {
    environment: metaAdsEnvironmentStatus(),
    insights,
    summary: summarizeMetaAdsInsights(insights),
    configured: true,
  };
}
