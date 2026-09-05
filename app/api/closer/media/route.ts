import { NextRequest, NextResponse } from "next/server";

import { authenticateCloserCertificate, CloserError } from "@/src/modules/closer/service";
import { prisma } from "@/src/infrastructure/database/prisma";
import { readCloserMedia } from "@/src/modules/closer/media-storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const certificate = await authenticateCloserCertificate(request.nextUrl.searchParams.get("certificate"), request.nextUrl.searchParams.get("key"));
    const type = request.nextUrl.searchParams.get("type");
    if (type !== "photo" && type !== "voice") return NextResponse.json({ error: "That media type is not supported." }, { status: 400 });
    if (!certificate.connectionId) return NextResponse.json({ error: "This plushie is not linked." }, { status: 404 });
    const connection = await prisma.closerConnection.findUnique({ where: { id: certificate.connectionId } });
    const path = type === "photo" ? connection?.photoPath : connection?.voicePath;
    const contentType = type === "photo" ? connection?.photoContentType : connection?.voiceContentType;
    if (!path || !contentType) return NextResponse.json({ error: "No media has been shared yet." }, { status: 404 });
    const bytes = await readCloserMedia(path);
    if (!bytes) return NextResponse.json({ error: "That media is no longer available." }, { status: 404 });
    return new NextResponse(bytes, { headers: { "Content-Type": contentType, "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof CloserError ? error.status : 500;
    const message = error instanceof Error ? error.message : "We could not load this media.";
    return NextResponse.json({ error: message }, { status });
  }
}
