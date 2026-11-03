import { manualOrderNotification } from "./manual-order-notification";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { mobileServiceClient } from "./mobile-api";

type FirebaseCredential = { project_id?: string; client_email?: string; private_key?: string };

function firebaseApp() {
  const encodedCredential = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  let savedCredential: FirebaseCredential | null = null;
  if (encodedCredential) {
    try { savedCredential = JSON.parse(Buffer.from(encodedCredential, "base64").toString("utf8")) as FirebaseCredential; } catch { return null; }
  }
  const projectId = savedCredential?.project_id || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = savedCredential?.client_email || process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (savedCredential?.private_key || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return getApps()[0] || initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

/** Sends a staff-only alert without ever blocking the customer's order. */
export async function notifyNewManualOrder(input: { id: string; reference: string; product: string; amountToCollect: number | null; shippingRegion: "WEST" | "EAST"; language?: string }) {
  try {
    const app = firebaseApp();
    if (!app) return;
    const { data, error } = await mobileServiceClient().from("mobile_push_devices").select("token,platform").eq("active", true);
    if (error || !data?.length) return;
    const alert = manualOrderNotification(input);
    const devices = data.filter(row => typeof row.token === "string" && row.token);
    const tokens: string[] = [];
    const responses = [];
    // Upgraded Android apps render the copy action themselves; legacy installs
    // keep their existing system notification until the update is installed.
    for (const native of [false, true]) {
      const group = devices.filter(row => (row.platform === "android-summary-v1") === native);
      for (let offset = 0; offset < group.length; offset += 500) {
        const batch = group.slice(offset, offset + 500).map(row => row.token as string);
        if (!batch.length) continue;
        const result = await getMessaging(app).sendEachForMulticast({
          tokens: batch,
          ...(!native ? { notification: { title: alert.title, body: alert.body } } : {}),
          data: { workspace: "manual_orders", intakeId: input.id, reference: input.reference, product: input.product.slice(0, 120), title: alert.title, body: alert.body, summary: alert.summary, language: alert.language, amountToCollect: input.amountToCollect === null ? "" : String(input.amountToCollect) },
          android: { priority: "high", ...(!native ? { notification: { channelId: "manual-orders", sound: "default" } } : {}) },
        });
        tokens.push(...batch); responses.push(...result.responses);
      }
    }
    const result = { responses };
    const inactive = result.responses.flatMap((response, index) => {
      const code = response.error?.code || "";
      return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token" ? [tokens[index]] : [];
    });
    if (inactive.length) await mobileServiceClient().from("mobile_push_devices").update({ active: false, updated_at: new Date().toISOString() }).in("token", inactive);
  } catch (error) {
    console.error("Manual Order notification was not sent", error instanceof Error ? error.message : error);
  }
}
