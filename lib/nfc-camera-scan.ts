export type CameraBarcode = { rawValue: string };
export type CameraPass = "original" | "contrast" | "left" | "right";

// Try the last readable lighting/angle first on the next fresh video frame.
// Every pass uses the whole view so multiple visible stickers still block writing.
export function createCameraScan() {
  let preferred: CameraPass = "original";
  const passes: CameraPass[] = ["original", "contrast", "left", "right"];
  return async (detect: (pass: CameraPass) => Promise<CameraBarcode[]>, signal: AbortSignal) => {
    for (const pass of [preferred, ...passes.filter(value => value !== preferred)]) {
      if (signal.aborted) return [];
      const found = await detect(pass);
      if (signal.aborted) return [];
      if (found.length) {
        preferred = pass;
        return found;
      }
    }
    return [];
  };
}

export function confirmedCameraCode(barcodes: CameraBarcode[], previous: string | null) {
  const code = barcodes.length === 1 ? barcodes[0].rawValue.trim().toUpperCase() : null;
  return { code, confirmed: !!code && /^NFC-\d{6,12}$/.test(code) && code === previous };
}
