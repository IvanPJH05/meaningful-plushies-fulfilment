import { PDFDocument } from "pdf-lib";
import { cookies } from "next/headers";
import {
  CANVA_REFRESH_COOKIE,
  canvaCookieOptions,
  decryptCanvaValue,
  encryptCanvaValue,
  refreshCanvaAccessToken,
} from "../../../lib/canva-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const CANVA_API = "https://api.canva.com/rest/v1";
const DEFAULT_TEMPLATE_ID = "EAHMnYdOAJk";

type CanvaJob = {
  id: string;
  status: "in_progress" | "success" | "failed";
  error?: { code?: string; message?: string };
  result?: { design?: { id?: string } };
  urls?: string[];
};

function cleanName(value: unknown) {
  return String(value ?? "").trim().toUpperCase().slice(0, 32);
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const encryptedRefreshToken = cookieStore.get(CANVA_REFRESH_COOKIE)?.value;
    if (!encryptedRefreshToken) return new Response("Connect Canva from the Print Envelope page first.", { status: 401 });
    const tokens = await refreshCanvaAccessToken(decryptCanvaValue(encryptedRefreshToken));
    cookieStore.set(CANVA_REFRESH_COOKIE, encryptCanvaValue(tokens.refresh_token), {
      ...canvaCookieOptions,
      maxAge: 60 * 60 * 24 * 30,
    });
    const token = tokens.access_token;

    const body = await request.json() as { names?: unknown[] };
    const names = (body.names ?? []).map(cleanName).filter(Boolean);
    if (!names.length) return new Response("Choose at least one order.", { status: 400 });

    const templateId = process.env.CANVA_ENVELOPE_TEMPLATE_ID || DEFAULT_TEMPLATE_ID;
    const pagePdfs: ArrayBuffer[] = [];

    for (let index = 0; index < names.length; index += 2) {
      const designId = await createAutofilledDesign(token, templateId, names[index], names[index + 1] ?? "");
      const pdfUrl = await exportDesign(token, designId);
      const pdfResponse = await fetch(pdfUrl, { cache: "no-store" });
      if (!pdfResponse.ok) throw new Error("Canva created the envelope but its PDF could not be downloaded.");
      pagePdfs.push(await pdfResponse.arrayBuffer());
    }

    const output = await PDFDocument.create();
    for (const pdfBytes of pagePdfs) {
      const source = await PDFDocument.load(pdfBytes);
      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach((page) => output.addPage(page));
    }

    const pdfBytes = await output.save();
    const pdfBuffer = pdfBytes.buffer.slice(
      pdfBytes.byteOffset,
      pdfBytes.byteOffset + pdfBytes.byteLength,
    ) as ArrayBuffer;

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=meaningful-plushies-envelopes.pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);
    return new Response(error instanceof Error ? error.message : "Canva could not generate the envelope PDF.", { status: 500 });
  }
}

async function createAutofilledDesign(token: string, templateId: string, topName: string, bottomName: string) {
  const response = await canvaFetch(token, "/autofills", {
    method: "POST",
    body: JSON.stringify({
      brand_template_id: templateId,
      title: `Envelope - ${topName}${bottomName ? ` - ${bottomName}` : ""}`,
      data: {
        top_plush_name: { type: "text", text: topName },
        bottom_plush_name: { type: "text", text: bottomName },
      },
    }),
  });
  const created = await response.json() as { job?: CanvaJob };
  if (!created.job?.id) throw new Error("Canva did not start the envelope design.");

  const job = await waitForJob(token, `/autofills/${created.job.id}`);
  const designId = job.result?.design?.id;
  if (!designId) throw new Error("Canva finished without returning an envelope design.");
  return designId;
}

async function exportDesign(token: string, designId: string) {
  const response = await canvaFetch(token, "/exports", {
    method: "POST",
    body: JSON.stringify({
      design_id: designId,
      format: { type: "pdf", export_quality: "regular" },
    }),
  });
  const created = await response.json() as { job?: CanvaJob };
  if (!created.job?.id) throw new Error("Canva did not start the envelope PDF export.");

  const job = await waitForJob(token, `/exports/${created.job.id}`);
  if (!job.urls?.[0]) throw new Error("Canva finished without returning an envelope PDF.");
  return job.urls[0];
}

async function waitForJob(token: string, path: string) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const response = await canvaFetch(token, path);
    const data = await response.json() as { job?: CanvaJob };
    if (!data.job) throw new Error("Canva returned an invalid job response.");
    if (data.job.status === "success") return data.job;
    if (data.job.status === "failed") {
      const detail = data.job.error?.message || "Canva could not complete the envelope job.";
      throw new Error(data.job.error?.code ? `${detail} (${data.job.error.code})` : detail);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Canva took too long to generate the envelope PDF. Please try again.");
}

async function canvaFetch(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${CANVA_API}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (response.ok) return response;

  const error = await response.json().catch(() => ({})) as { code?: string; message?: string };
  if (response.status === 401) throw new Error("The Canva connection expired. Reconnect Canva from the Print Envelope page.");
  throw new Error(error.message ? (error.code ? `${error.message} (${error.code})` : error.message) : `Canva request failed (${response.status}).`);
}
