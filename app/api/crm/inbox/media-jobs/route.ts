import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import {
  enqueueWhatsAppMediaJobsForMessages,
  processDueWhatsAppMediaJobs,
} from "@/src/modules/whatsapp/media-jobs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const business = await ensureDefaultBusiness();
  const body = await request.json().catch(() => ({})) as {
    createdAfter?: string;
    limit?: number;
    processLimit?: number;
  };
  const limit = Math.max(1, Math.min(Number(body.limit || 50), 200));
  const processLimit = Math.max(1, Math.min(Number(body.processLimit || 5), 10));
  const where: Prisma.MessageWhereInput = {
    businessId: business.id,
    attachments: {
      some: {
        originalStoragePath: null,
        OR: [
          { externalMediaId: { not: null } },
          { storageKey: { startsWith: "whatsapp-media:" } },
        ],
      },
    },
  };

  if (body.createdAfter) {
    const createdAfter = new Date(body.createdAfter);
    if (!Number.isNaN(createdAfter.getTime())) {
      where.createdAt = { gte: createdAfter };
    }
  }

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: { id: true },
    take: limit,
  });
  const queued = await enqueueWhatsAppMediaJobsForMessages(messages.map((message) => message.id));
  const processed = await processDueWhatsAppMediaJobs({ limit: processLimit });

  return NextResponse.json({ ok: true, queued, processed });
}
