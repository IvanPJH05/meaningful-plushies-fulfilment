import { NextRequest, NextResponse } from "next/server";

import { authenticateCloserAccess, closerConnectionForCertificate, CloserError } from "@/src/modules/closer/service";
import { readCloserMedia } from "@/src/modules/closer/media-storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const certificate = await authenticateCloserAccess(request.nextUrl.searchParams.get("certificate"), request.nextUrl.searchParams.get("key"), request.nextUrl.searchParams.get("adminPreview"));
    const type = request.nextUrl.searchParams.get("type");
    if (type !== "photo" && type !== "voice") return NextResponse.json({ error: "That media type is not supported." }, { status: 400 });
    const connection = await closerConnectionForCertificate(certificate.certificateId);
    // Use the shared-pair lookup rather than the certificate's stored
    // connection ID. This lets both phones load media from pairs created
    // before the second certificate's direct connection ID was persisted.
    if (!connection) return NextResponse.json({ error: "This plushie is not linked." }, { status: 404 });
    const path = type === "photo" ? connection?.photo_path : connection?.voice_path;
    const contentType = type === "photo" ? connection?.photo_content_type : connection?.voice_content_type;
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
