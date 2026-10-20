export async function probeNfcHelper(fetcher: typeof fetch = fetch) {
  try {
    const response = await fetcher("http://127.0.0.1:17654/health", { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const result = await response.json();
    return response.ok && result.ok === true && result.helper === "windows-nfc-writer";
  } catch { return false; }
}
export async function waitForNfcHelper(probe: () => Promise<boolean> = probeNfcHelper, wait: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 1000))) {
  const deadline = Date.now() + 30000;
  for (let attempt = 0; attempt < 30 && Date.now() < deadline; attempt++) {
    if (await probe()) return true;
    if (attempt < 29) await wait();
  }
  return false;
}
