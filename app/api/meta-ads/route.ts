import { NextResponse } from "next/server";

import { fetchMetaAdsInsights } from "../../../lib/meta-ads";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function dateParam(url: URL, name: string, fallback: string) {
  const value = url.searchParams.get(name) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStartKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = dateParam(url, "from", monthStartKey());
  const to = dateParam(url, "to", todayKey());

  try {
    const result = await fetchMetaAdsInsights(from, to);
    return json(200, { ok: true, from, to, ...result });
  } catch (error) {
    return json(500, {
      ok: false,
      from,
      to,
      error: error instanceof Error ? error.message : "Meta ads dashboard could not be loaded.",
    });
  }
}
