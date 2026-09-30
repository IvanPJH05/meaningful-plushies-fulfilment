import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { mobileServiceClient } from "./mobile-api";

function firebaseApp() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return getApps()[0] || initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

/** Sends a staff-only alert without ever blocking the customer's order. */
export async function notifyNewManualOrder(input: { id: string; reference: string; product: string }) {
  try {
    const app = firebaseApp();
    if (!app) return;
    const { data, error } = await mobileServiceClient().from("mobile_push_devices").select("token").eq("active", true);
    if (error || !data?.length) return;
    const tokens = data.map((row) => typeof row.token === "string" ? row.token : "").filter(Boolean);
    if (!tokens.length) return;
    const result = await getMessaging(app).sendEachForMulticast({
      tokens,
      notification: { title: "New Manual Order", body: `${input.reference} is awaiting payment approval.` },
      data: { workspace: "manual_orders", intakeId: input.id, product: input.product.slice(0, 120) },
      android: { priority: "high", notification: { channelId: "manual-orders", sound: "default" } },
    });
    const inactive = result.responses.flatMap((response, index) => {
      const code = response.error?.code || "";
      return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token" ? [tokens[index]] : [];
    });
    if (inactive.length) await mobileServiceClient().from("mobile_push_devices").update({ active: false, updated_at: new Date().toISOString() }).in("token", inactive);
  } catch (error) {
    console.error("Manual Order notification was not sent", error instanceof Error ? error.message : error);
  }
}
