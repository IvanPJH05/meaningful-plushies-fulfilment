import { NextResponse } from "next/server";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import {
  readCachedWhatsAppMedia,
  writeCachedWhatsAppMedia,
} from "@/src/modules/whatsapp/media-cache";

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

function buildMediaResponse(args: {
  bytes: ArrayBuffer;
  contentType: string;
  disposition: string;
  filename: string;
  cacheStatus: "HIT" | "MISS" | "BYPASS";
}) {
  return new NextResponse(args.bytes, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=604800, stale-while-revalidate=86400",
      "Content-Disposition": `${args.disposition}; filename="${args.filename}"`,
      "Content-Type": args.contentType,
      "X-WhatsApp-Media-Cache": args.cacheStatus,
    },
  });
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

  const fallbackContentType = attachment.contentType || "application/octet-stream";
  const fallbackFilename = safeFilename(
    attachment.originalName,
    `${mediaId}.${fallbackContentType.split("/")[1] || "bin"}`,
  );
  const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";

  const cached = await readCachedWhatsAppMedia({
    businessId: attachment.message.businessId,
    mediaId,
  });
  if (cached) {
    return buildMediaResponse({
      bytes: cached,
      contentType: fallbackContentType,
      disposition,
      filename: fallbackFilename,
      cacheStatus: "HIT",
    });
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

  const remoteMediaResponse = await fetch(metadata.url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!remoteMediaResponse.ok) {
    return json(remoteMediaResponse.status || 502, { ok: false, error: "WhatsApp media could not be downloaded." });
  }

  const contentType = attachment.contentType || metadata.mime_type || remoteMediaResponse.headers.get("content-type") || "application/octet-stream";
  const filename = safeFilename(attachment.originalName, `${mediaId}.${contentType.split("/")[1] || "bin"}`);
  const bytes = await remoteMediaResponse.arrayBuffer();
  const cachedAfterDownload = await writeCachedWhatsAppMedia({
    businessId: attachment.message.businessId,
    mediaId,
    bytes,
    contentType,
  });

  return buildMediaResponse({
    bytes,
    contentType,
    disposition,
    filename,
    cacheStatus: cachedAfterDownload ? "MISS" : "BYPASS",
  });
}
