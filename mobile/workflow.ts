export function certificateUrl(value?: string) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function isProductionOrder(status: string) {
  return ["uploading_audio", "sent_for_sewing", "packed"].includes(status);
}
