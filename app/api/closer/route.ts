import { NextRequest, NextResponse } from "next/server";

import {
  CloserError,
  acceptCloserConnection,
  authenticateCloserCertificate,
  closerState,
  rejectCloserConnection,
  requestCloserConnection,
  uploadCloserMedia,
  unlinkCloserConnection,
} from "@/src/modules/closer/service";
import { deleteCloserMedia } from "@/src/modules/closer/media-storage";

export const runtime = "nodejs";
const maxMediaBytes = 3 * 1024 * 1024;

function decodeMedia(value: unknown, type: unknown) {
  if (type !== "photo" && type !== "voice") throw new CloserError("That media type is not supported.");
  if (typeof value !== "string") throw new CloserError("Choose a photo or record a voice note first.");
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new CloserError("Choose a supported image or audio file.");
  const contentType = match[1].toLowerCase();
  const allowed = type === "photo" ? ["image/jpeg", "image/png", "image/webp"] : ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"];
  if (!allowed.includes(contentType)) throw new CloserError("Choose a supported image or audio file.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.byteLength || bytes.byteLength > maxMediaBytes) throw new CloserError("Please choose a smaller file (up to 3 MB after compression).");
  return { type, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), contentType } as const;
}

function responseError(error: unknown) {
  if (error instanceof CloserError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Closer API error", error);
  return NextResponse.json({ error: "We could not update this shared space. Please try again." }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const certificate = await authenticateCloserCertificate(body.certificateId, body.accessKey);
    const action = body.action;

    // Keep the read response consistent with every other Closer action. The
    // customer page always reads `data.state`; returning the state directly
    // left a successfully loaded page with nothing to render.
    if (action === "state") return NextResponse.json({ state: await closerState(certificate.certificateId) });
    if (action === "request") {
      await requestCloserConnection(certificate.certificateId, body.partnerCertificateId, body.name);
      return NextResponse.json({ ok: true, state: await closerState(certificate.certificateId) });
    }
    if (action === "reject") {
      await rejectCloserConnection(certificate.certificateId, body.requestId);
      return NextResponse.json({ ok: true, state: await closerState(certificate.certificateId) });
    }
    if (action === "accept") {
      await acceptCloserConnection(certificate.certificateId, body.requestId, body.name);
      return NextResponse.json({ ok: true, state: await closerState(certificate.certificateId) });
    }
    if (action === "unlink") {
      const result = await unlinkCloserConnection(certificate.certificateId);
      await deleteCloserMedia(result.mediaPaths);
      return NextResponse.json({ ok: true, state: await closerState(certificate.certificateId) });
    }
    if (action === "upload") {
      const media = decodeMedia(body.data, body.mediaType);
      await uploadCloserMedia({ certificateId: certificate.certificateId, ...media });
      return NextResponse.json({ ok: true, state: await closerState(certificate.certificateId) });
    }
    throw new CloserError("That action is not supported.");
  } catch (error) {
    return responseError(error);
  }
}
