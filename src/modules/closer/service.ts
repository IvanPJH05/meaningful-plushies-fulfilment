import { createHash, timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";

import { CloserPairingRequestStatus } from "@prisma/client";

import { prisma } from "@/src/infrastructure/database/prisma";
import { deleteCloserMedia, storeCloserMedia } from "@/src/modules/closer/media-storage";

const nameLimit = 60;

export class CloserError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function cleanText(value: unknown, label: string, maxLength = nameLimit) {
  if (typeof value !== "string") throw new CloserError(`${label} is required.`);
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > maxLength) throw new CloserError(`${label} must be between 1 and ${maxLength} characters.`);
  return cleaned;
}

export function hashCloserAccessKey(accessKey: string) {
  return createHash("sha256").update(accessKey).digest("hex");
}

export async function authenticateCloserCertificate(certificateId: unknown, accessKey: unknown) {
  const cleanCertificateId = cleanText(certificateId, "Certificate ID", 100);
  if (typeof accessKey !== "string" || !accessKey) throw new CloserError("This certificate link is not valid.", 401);

  const certificate = await prisma.closerCertificate.findUnique({ where: { certificateId: cleanCertificateId } });
  if (!certificate) throw new CloserError("We could not find this certificate.", 404);

  const suppliedHash = Buffer.from(hashCloserAccessKey(accessKey), "utf8");
  const storedHash = Buffer.from(certificate.accessKeyHash, "utf8");
  if (suppliedHash.length !== storedHash.length || !timingSafeEqual(suppliedHash, storedHash)) {
    throw new CloserError("This certificate link is not valid.", 401);
  }

  return certificate;
}

async function connectionFor(certificateId: string) {
  const certificate = await prisma.closerCertificate.findUnique({ where: { certificateId } });
  if (!certificate?.connectionId) return null;
  return prisma.closerConnection.findUnique({ where: { id: certificate.connectionId } });
}

export async function closerState(certificateId: string) {
  const [connection, incomingRequest] = await Promise.all([
    connectionFor(certificateId),
    prisma.closerPairingRequest.findFirst({
      where: { toCertificateId: certificateId, status: CloserPairingRequestStatus.PENDING },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!connection) {
    return {
      status: "unlinked" as const,
      request: incomingRequest ? { id: incomingRequest.id, requesterName: incomingRequest.requesterName, fromCertificateId: incomingRequest.fromCertificateId } : null,
    };
  }

  const isFirst = connection.firstCertificateId === certificateId;
  return {
    status: "linked" as const,
    connection: {
      id: connection.id,
      names: isFirst ? [connection.firstName, connection.secondName] : [connection.secondName, connection.firstName],
      partnerCertificateId: isFirst ? connection.secondCertificateId : connection.firstCertificateId,
      canUploadNextPhoto: connection.nextPhotoCertificateId === certificateId,
      hasPhoto: Boolean(connection.photoPath),
      hasVoice: Boolean(connection.voicePath),
    },
  };
}

export async function requestCloserConnection(fromCertificateId: string, toCertificateIdValue: unknown, requesterNameValue: unknown) {
  const toCertificateId = cleanText(toCertificateIdValue, "Partner certificate ID", 100);
  const requesterName = cleanText(requesterNameValue, "Your name");
  if (fromCertificateId === toCertificateId) throw new CloserError("Choose your partner's certificate, not your own.");

  return prisma.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.closerCertificate.findUnique({ where: { certificateId: fromCertificateId } }),
      tx.closerCertificate.findUnique({ where: { certificateId: toCertificateId } }),
    ]);
    if (!to) throw new CloserError("That certificate ID was not found.", 404);
    if (from?.connectionId || to.connectionId) throw new CloserError("One of these plushies is already linked.", 409);

    await tx.closerPairingRequest.updateMany({
      where: { fromCertificateId, toCertificateId, status: CloserPairingRequestStatus.PENDING },
      data: { status: CloserPairingRequestStatus.CANCELLED },
    });

    return tx.closerPairingRequest.create({ data: { fromCertificateId, toCertificateId, requesterName } });
  });
}

export async function rejectCloserConnection(certificateId: string, requestIdValue: unknown) {
  const requestId = cleanText(requestIdValue, "Connection request", 100);
  const request = await prisma.closerPairingRequest.findFirst({ where: { id: requestId, toCertificateId: certificateId, status: CloserPairingRequestStatus.PENDING } });
  if (!request) throw new CloserError("That connection request is no longer available.", 404);
  await prisma.closerPairingRequest.update({ where: { id: request.id }, data: { status: CloserPairingRequestStatus.REJECTED } });
}

export async function acceptCloserConnection(certificateId: string, requestIdValue: unknown, recipientNameValue: unknown) {
  const requestId = cleanText(requestIdValue, "Connection request", 100);
  const recipientName = cleanText(recipientNameValue, "Your name");

  return prisma.$transaction(async (tx) => {
    const request = await tx.closerPairingRequest.findFirst({ where: { id: requestId, toCertificateId: certificateId, status: CloserPairingRequestStatus.PENDING } });
    if (!request) throw new CloserError("That connection request is no longer available.", 404);

    const [from, to] = await Promise.all([
      tx.closerCertificate.findUnique({ where: { certificateId: request.fromCertificateId } }),
      tx.closerCertificate.findUnique({ where: { certificateId } }),
    ]);
    if (!from || !to) throw new CloserError("One of these certificates is no longer available.", 404);
    if (from.connectionId || to.connectionId) throw new CloserError("One of these plushies is already linked.", 409);

    const connection = await tx.closerConnection.create({
      data: {
        firstCertificateId: from.certificateId,
        secondCertificateId: to.certificateId,
        firstName: request.requesterName,
        secondName: recipientName,
        nextPhotoCertificateId: from.certificateId,
      },
    });
    await tx.closerCertificate.updateMany({ where: { certificateId: { in: [from.certificateId, to.certificateId] } }, data: { connectionId: connection.id } });
    await tx.closerPairingRequest.update({ where: { id: request.id }, data: { status: CloserPairingRequestStatus.ACCEPTED } });
    await tx.closerPairingRequest.updateMany({
      where: { OR: [{ fromCertificateId: { in: [from.certificateId, to.certificateId] } }, { toCertificateId: { in: [from.certificateId, to.certificateId] } }], status: CloserPairingRequestStatus.PENDING },
      data: { status: CloserPairingRequestStatus.CANCELLED },
    });
    await tx.closerActivity.create({ data: { connectionId: connection.id, actorCertificateId: certificateId, action: "connection_accepted", details: { requestId } } });
    return connection;
  });
}

export async function unlinkCloserConnection(certificateId: string) {
  return prisma.$transaction(async (tx) => {
    const certificate = await tx.closerCertificate.findUnique({ where: { certificateId } });
    if (!certificate?.connectionId) throw new CloserError("This plushie is not linked.", 409);
    const connection = await tx.closerConnection.findUnique({ where: { id: certificate.connectionId } });
    if (!connection) throw new CloserError("This connection is no longer available.", 404);

    await tx.closerActivity.create({ data: { connectionId: connection.id, actorCertificateId: certificateId, action: "connection_unlinked" } });
    await tx.closerCertificate.updateMany({ where: { certificateId: { in: [connection.firstCertificateId, connection.secondCertificateId] } }, data: { connectionId: null } });
    await tx.closerConnection.delete({ where: { id: connection.id } });
    return { mediaPaths: [connection.photoPath, connection.voicePath] };
  });
}

export async function uploadCloserMedia(args: {
  certificateId: string;
  type: "photo" | "voice";
  bytes: ArrayBuffer;
  contentType: string;
}) {
  const certificate = await prisma.closerCertificate.findUnique({ where: { certificateId: args.certificateId } });
  if (!certificate?.connectionId) throw new CloserError("Link your plushies before sharing media.", 409);
  const connection = await prisma.closerConnection.findUnique({ where: { id: certificate.connectionId } });
  if (!connection) throw new CloserError("This connection is no longer available.", 404);
  if (args.type === "photo" && connection.nextPhotoCertificateId !== args.certificateId) {
    throw new CloserError("It is your partner’s turn to upload the next photo.", 409);
  }

  const extension = args.type === "photo" ? "jpg" : args.contentType === "audio/mp4" ? "m4a" : "webm";
  const path = `${connection.id}/${args.type}-${randomUUID()}.${extension}`;
  await storeCloserMedia(path, args.bytes, args.contentType);

  try {
    const partnerCertificateId = connection.firstCertificateId === args.certificateId ? connection.secondCertificateId : connection.firstCertificateId;
    const update = args.type === "photo"
      ? { photoPath: path, photoContentType: args.contentType, nextPhotoCertificateId: partnerCertificateId }
      : { voicePath: path, voiceContentType: args.contentType };
    const previousPath = args.type === "photo" ? connection.photoPath : connection.voicePath;
    const updated = await prisma.closerConnection.updateMany({
      where: args.type === "photo" ? { id: connection.id, nextPhotoCertificateId: args.certificateId } : { id: connection.id },
      data: update,
    });
    if (!updated.count) throw new CloserError("Your partner just shared a photo. Please wait for your turn.", 409);
    await prisma.closerActivity.create({ data: { connectionId: connection.id, actorCertificateId: args.certificateId, action: `${args.type}_updated` } });
    await deleteCloserMedia([previousPath]);
  } catch (error) {
    await deleteCloserMedia([path]);
    throw error;
  }
}
