import { NextResponse } from "next/server";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import {
  fallbackWhatsAppMediaContentType,
  whatsappMediaFromMessageMetadata,
} from "@/src/modules/whatsapp/media-metadata";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function safeFilename(value: string | null | undefined, fallback: string) {
  const cleaned = (value || fallback).replace(/[^\w.\- ]+/g, "_").trim();
  return cleaned || fallback;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await context.params;
  const business = await ensureDefaultBusiness();
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      businessId: true,
      messageType: true,
      metadata: true,
    },
  });

  if (!message || message.businessId !== business.id) {
    return json(404, { ok: false, error: "Message not found." });
  }

  const media = whatsappMediaFromMessageMetadata(message.metadata, message.messageType);
  if (!media?.id) {
    return json(404, { ok: false, error: "WhatsApp media is not available for this message." });
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    return json(400, { ok: false, error: "WHATSAPP_ACCESS_TOKEN is missing." });
  }

  const graphVersion = process.env.META_GRAPH_API_VERSION || "v20.0";
  const metadataResponse = await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(media.id)}`, {
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

  const contentType = media.mimeType || metadata.mime_type || mediaResponse.headers.get("content-type") || fallbackWhatsAppMediaContentType(message.messageType);
  const filename = safeFilename(media.filename, `${media.id}.${contentType.split("/")[1] || "bin"}`);
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
