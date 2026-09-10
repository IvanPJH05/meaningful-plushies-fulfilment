import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { createCloserCertificate, loadCloserAdminDashboard, saveCloserTheme, unlinkCloserConnection } from "@/src/modules/closer/service";
import { deleteCloserMedia } from "@/src/modules/closer/media-storage";
import { prisma } from "@/src/infrastructure/database/prisma";

export const runtime = "nodejs";

async function requireAdmin(request: NextRequest) {
  const token = request.headers.get("x-dashboard-session") || "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false;
  const rows = await prisma.$queryRaw<{ is_admin: boolean }[]>(Prisma.sql`select public.dashboard_is_admin(${token}::uuid) as is_admin`);
  return Boolean(rows[0]?.is_admin);
}

function error(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }

export async function GET(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return error("Administrator access is required.", 403);
    const dashboard = await loadCloserAdminDashboard();
    return NextResponse.json({
      certificates: dashboard.certificates.map((certificate) => ({ certificateId: certificate.certificate_id, connectionId: certificate.connection_id, createdAt: certificate.created_at })),
      connections: dashboard.connections.map((connection) => ({ id: connection.id, firstCertificateId: connection.first_certificate_id, secondCertificateId: connection.second_certificate_id, firstName: connection.first_name, secondName: connection.second_name })),
      activity: dashboard.activity.map((item) => ({ id: item.id, action: item.action, actorCertificateId: item.actor_certificate_id, createdAt: item.created_at })),
      theme: dashboard.theme,
    });
  } catch (caught) {
    console.error("Closer admin load failed", caught);
    return error("Closer settings could not be loaded.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return error("Administrator access is required.", 403);
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "create_certificate") {
      const certificateId = typeof body.certificateId === "string" ? body.certificateId.trim() : "";
      if (!/^[A-Za-z0-9_-]{3,100}$/.test(certificateId)) return error("Use 3–100 letters, numbers, hyphens, or underscores for the certificate ID.");
      const accessKey = randomBytes(24).toString("base64url");
      await createCloserCertificate(certificateId, accessKey);
      return NextResponse.json({ ok: true, certificate: { certificateId, accessKey } });
    }
    if (body.action === "save_theme") {
      const theme = typeof body.theme === "object" && body.theme !== null ? body.theme : {};
      await saveCloserTheme(theme as Record<string, unknown>);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "unlink") {
      const certificateId = typeof body.certificateId === "string" ? body.certificateId : "";
      const result = await unlinkCloserConnection(certificateId);
      await deleteCloserMedia(result.mediaPaths);
      return NextResponse.json({ ok: true });
    }
    return error("That action is not supported.");
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Closer settings could not be updated.";
    return error(message, message.includes("already") ? 409 : 500);
  }
}
