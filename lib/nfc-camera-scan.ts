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

export function createCameraCardCycle() {
  let activeUid: string | null = null;
  let previousCode: string | null = null;
  let awaitingRemoval = false;
  let verified = false;
  return {
    observe(uid: string | null): "empty" | "ready" | "changed" | "waiting-removal" {
      if (!uid) {
        activeUid = previousCode = null;
        awaitingRemoval = verified = false;
        return "empty";
      }
      if (activeUid && uid !== activeUid) {
        // A verified card can be replaced between polls without an empty poll.
        // A swap during scanning or a failed write still requires clearing it.
        if (!verified) {
          awaitingRemoval = true;
          previousCode = null;
          return "changed";
        }
        activeUid = previousCode = null;
        awaitingRemoval = verified = false;
      }
      if (awaitingRemoval) return "waiting-removal";
      activeUid = uid;
      return "ready";
    },
    read(barcodes: CameraBarcode[]) {
      const result = confirmedCameraCode(barcodes, previousCode);
      previousCode = result.code;
      return result;
    },
    beginWrite() { awaitingRemoval = true; verified = false; previousCode = null; },
    finishWrite(success: boolean) { verified = success; },
    interrupt() { previousCode = null; },
  };
}
