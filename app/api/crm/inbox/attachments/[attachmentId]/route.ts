import { NextResponse } from "next/server";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function mediaIdFromStorageKey(storageKey: string) {
  return storageKey.startsWith("whatsapp-media:") ? storageKey.slice("whatsapp-media:".length) : "";
}

function safeFilename(value: string | null | undefined, fallback: string) {
  const cleaned = (value || fallback).replace(/[^\w.\- ]+/g, "_").trim();
  return cleaned || fallback;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await context.params;
  const business = await ensureDefaultBusiness();
  const attachment = await prisma.messageAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      message: {
        select: { businessId: true },
      },
    },
  });

  if (!attachment || attachment.message.businessId !== business.id) {
    return json(404, { ok: false, error: "Attachment not found." });
  }

  const mediaId = mediaIdFromStorageKey(attachment.storageKey);
  if (!mediaId) {
    return json(404, { ok: false, error: "Attachment is not available for download." });
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    return json(400, { ok: false, error: "WHATSAPP_ACCESS_TOKEN is missing." });
  }

  const graphVersion = process.env.META_GRAPH_API_VERSION || "v20.0";
  const metadataResponse = await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(mediaId)}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const metadata = await metadataResponse.json().catch(() => ({})) as { url?: string; mime_type?: string };
  if (!metadataResponse.ok || !metadata.url) {
    return json(metadataResponse.status || 502, {
      ok: false,
      error: "WhatsApp media URL could not be retrieved.",
      details: metadata,
    });
  }

  const mediaResponse = await fetch(metadata.url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!mediaResponse.ok) {
    return json(mediaResponse.status || 502, { ok: false, error: "WhatsApp media could not be downloaded." });
  }

  const contentType = attachment.contentType || metadata.mime_type || mediaResponse.headers.get("content-type") || "application/octet-stream";
  const filename = safeFilename(attachment.originalName, `${mediaId}.${contentType.split("/")[1] || "bin"}`);
  const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
  const bytes = await mediaResponse.arrayBuffer();

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Content-Type": contentType,
    },
  });
}
