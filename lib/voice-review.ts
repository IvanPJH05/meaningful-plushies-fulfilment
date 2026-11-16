import type { Order } from "./types";

const reviewPrefix = "Recording needs review: ";

export function voiceReviewReason(notes: string | undefined) {
  return notes?.split("\n").find(line => line.startsWith(reviewPrefix))?.slice(reviewPrefix.length) ?? "";
}

export function setVoiceReviewReason(notes: string | undefined, reason: string) {
  const lines = notes ? notes.split("\n").filter(line => !line.startsWith(reviewPrefix)) : [];
  if (reason) lines.push(reviewPrefix + reason);
  return lines.join("\n");
}

export function withoutTikTokAttachment(patch: Partial<Order>) {
  const rest = { ...patch };
  delete rest.tikTokFileDataUrl;
  delete rest.tikTokFileName;
  delete rest.tikTokFileType;
  return rest;
}

export class VoiceReviewFlaggedError extends Error {
  readonly reviewedOrder: Order;

  constructor(message: string, reviewedOrder: Order) {
    super(message);
    this.reviewedOrder = reviewedOrder;
  }
}
