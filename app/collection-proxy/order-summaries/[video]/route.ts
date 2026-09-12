import { NextRequest } from "next/server";

const validVideos = new Set([
  "b5.mp4", "b10.mp4", "b20.mp4",
  "t5.mp4", "t10.mp4", "t20.mp4",
  "d5.mp4", "d10.mp4", "d20.mp4",
  "h5.mp4", "h10.mp4", "h20.mp4",
]);

const appOrigin = "https://meaningful-plushies-fulfilment.vercel.app";

export async function GET(request: NextRequest, { params }: { params: Promise<{ video: string }> }) {
  const { video } = await params;
  if (!validVideos.has(video)) return new Response("Not found", { status: 404 });

  const source = await fetch(`${appOrigin}/order-summaries/${encodeURIComponent(video)}`, {
    headers: request.headers.get("range") ? { range: request.headers.get("range")! } : undefined,
  });
  if (!source.ok && source.status !== 206) return new Response("Video unavailable", { status: source.status });

  const headers = new Headers();
  for (const header of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const value = source.headers.get(header);
    if (value) headers.set(header, value);
  }
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(source.body, { status: source.status, headers });
}
