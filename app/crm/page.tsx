import styles from "./page.module.css";
import { CRM_AI_MODES, CRM_LEAD_STAGES, CRM_PHASES } from "@/src/shared/constants/crm";
import {
  metaCoexistenceLimitations,
  metaCoexistenceManualSetupSteps,
} from "@/src/modules/onboarding/meta-coexistence";
import { paidManualOrderPhase2Policy } from "@/src/modules/sales/paid-manual-order-flow";
import {
  getMissingPhase1Env,
  getMissingPhase2Env,
  getMissingPhase3Env,
  hasMetaWebhookSecret,
  hasOpenAiApiKey,
  hasShopifyAdminAuth,
} from "@/src/shared/validation/env";
import { crmAiAutoReplyEnabled, crmAiSuggestEnabled, whatsappAssistantModel } from "@/src/modules/openai/whatsapp-assistant";

const webhookEndpoint = "/api/crm/whatsapp/webhook";
const commandEndpoint = "/api/crm/ai/commands/manual-order";

function getPublicBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://meaningful-plushies-fulfilment.vercel.app";
}

function StatusRow(props: { label: string; ready: boolean; detail: string }) {
  return (
    <div className={styles.statusRow}>
      <div>
        <p className={styles.statusLabel}>{props.label}</p>
        <p className={styles.statusDetail}>{props.detail}</p>
      </div>
      <span className={props.ready ? styles.readyBadge : styles.missingBadge}>
        {props.ready ? "Ready" : "Needed"}
      </span>
    </div>
  );
}

export default function CrmPhaseOnePage() {
  const missingEnv = getMissingPhase1Env();
  const missingPhase2Env = getMissingPhase2Env();
  const missingPhase3Env = getMissingPhase3Env();
  const baseUrl = getPublicBaseUrl();
  const webhookUrl = `${baseUrl}${webhookEndpoint}`;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "Not configured yet";
  const shopifyReady = hasShopifyAdminAuth();
  const metaWebhookSecretReady = hasMetaWebhookSecret();
  const whatsappSendReady = Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const openAiReady = hasOpenAiApiKey();
  const aiSuggestReady = crmAiSuggestEnabled();
  const aiAutoReplyReady = crmAiAutoReplyEnabled();
  const databaseReady = Boolean(process.env.DATABASE_URL);
  const phase2Ready = missingPhase2Env.length === 0;
  const phase3Ready = missingPhase3Env.length === 0;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.eyebrow}>WhatsApp CRM Workspace</div>
        <h1 className={styles.title}>Meaningful Plushies AI Sales CRM</h1>
        <p className={styles.subtitle}>
          Phase 2 starts the paid-first sales flow beside the current fulfilment app: WhatsApp webhooks,
          AI command logging, and a guarded manual-order command that only runs after payment is confirmed.
        </p>
        <div className={styles.heroActions}>
          <a href="/crm/inbox">Open WhatsApp inbox</a>
        </div>
      </section>

      <section className={styles.grid} aria-label="Phase 1 status">
        <div className={styles.card}>
          <p className={styles.cardTitle}>WhatsApp approach</p>
          <p className={styles.cardValue}>Official Meta</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardTitle}>Tenant isolation</p>
          <p className={styles.cardValue}>businessId</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardTitle}>AI order rule</p>
          <p className={styles.cardValue}>Paid first</p>
        </div>
        <div className={`${styles.card} ${phase2Ready ? styles.cardReady : styles.cardMissing}`}>
          <p className={styles.cardTitle}>Phase 2 readiness</p>
          <p className={styles.cardValue}>{phase2Ready ? "Ready" : `${missingPhase2Env.length} left`}</p>
        </div>
        <div className={`${styles.card} ${phase3Ready ? styles.cardReady : styles.cardMissing}`}>
          <p className={styles.cardTitle}>ChatGPT connection</p>
          <p className={styles.cardValue}>{phase3Ready ? "Ready" : `${missingPhase3Env.length} left`}</p>
        </div>
      </section>

      <section className={styles.sectionGrid}>
        <div className={`${styles.panel} ${styles.fullWidthPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Connection checklist</h2>
              <p>This tells us what can work today and what still needs a real Meta or WhatsApp value from your account.</p>
            </div>
            <span className={phase2Ready ? styles.readyBadge : styles.missingBadge}>
              {phase2Ready ? "All connected" : "Setup still needed"}
            </span>
          </div>
          <div className={styles.statusGrid}>
            <StatusRow
              label="Supabase CRM database"
              ready={databaseReady}
              detail="Stores CRM businesses, leads, conversations, command logs, and audit records."
            />
            <StatusRow
              label="Shopify manual-order access"
              ready={shopifyReady}
              detail="Uses either SHOPIFY_ADMIN_ACCESS_TOKEN or the existing Shopify client ID and client secret."
            />
            <StatusRow
              label="Meta webhook signature"
              ready={metaWebhookSecretReady}
              detail="Needed so incoming WhatsApp webhook messages can be trusted."
            />
            <StatusRow
              label="WhatsApp send access"
              ready={whatsappSendReady}
              detail="Needs WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID before the app can send messages."
            />
            <StatusRow
              label="ChatGPT / OpenAI"
              ready={openAiReady}
              detail={`Uses OPENAI_API_KEY. Model: ${whatsappAssistantModel()}.`}
            />
            <StatusRow
              label="AI reply mode"
              ready={aiSuggestReady || aiAutoReplyReady}
              detail={aiAutoReplyReady ? "Automatic WhatsApp replies are enabled." : "Suggest-only mode is enabled. Set CRM_AI_AUTO_REPLY=true only when ready for live replies."}
            />
          </div>
        </div>

        <div className={`${styles.panel} ${styles.fullWidthPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Meta webhook values</h2>
              <p>Paste these into Meta when setting up the WhatsApp webhook. The access token stays private in Vercel.</p>
            </div>
          </div>
          <div className={styles.setupGrid}>
            <div className={styles.setupBox}>
              <p className={styles.setupLabel}>Callback URL</p>
              <code>{webhookUrl}</code>
            </div>
            <div className={styles.setupBox}>
              <p className={styles.setupLabel}>Verify token</p>
              <code>{verifyToken}</code>
            </div>
            <div className={styles.setupBox}>
              <p className={styles.setupLabel}>Subscribe to fields</p>
              <code>messages, message_template_status_update, phone_number_name_update</code>
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <h2>Phase plan</h2>
          <p>Phase 2 is active as a controlled backend flow. Full autonomous replies and a live inbox still stay behind later approval.</p>
          <div className={styles.pillRow}>
            {CRM_PHASES.map((phase) => (
              <span className={styles.pill} key={phase}>
                {phase}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.panel} id="paid-first-flow">
          <h2>Paid-first manual order flow</h2>
          <p>The new command endpoint is designed for WhatsApp sales where the customer pays before receiving the Shopify link.</p>
          <ol className={styles.list}>
            {paidManualOrderPhase2Policy.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <pre className={styles.code}>{JSON.stringify({
            commandEndpoint,
            webhookEndpoint,
            missingPhase2Env,
            missingPhase3Env,
            aiReplyMode: aiAutoReplyReady ? "auto_reply" : aiSuggestReady ? "suggest_only" : "off",
            openAiModel: whatsappAssistantModel(),
          }, null, 2)}</pre>
        </div>

        <div className={styles.panel}>
          <h2>Lead controls prepared</h2>
          <p>These values are now represented in the schema and can drive the future inbox safely.</p>
          <div className={styles.pillRow}>
            {CRM_LEAD_STAGES.map((stage) => (
              <span className={styles.pill} key={stage}>
                {stage.replaceAll("_", " ")}
              </span>
            ))}
          </div>
          <div className={styles.pillRow}>
            {CRM_AI_MODES.map((mode) => (
              <span className={styles.pill} key={mode}>
                AI {mode.replaceAll("_", " ")}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.panel} id="meta-setup">
          <h2>Meta Coexistence setup</h2>
          <p>The app cannot secretly connect to WhatsApp. These are the exact merchant-side steps needed in Meta.</p>
          <ol className={styles.list}>
            {metaCoexistenceManualSetupSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <div className={styles.panel} id="tenant-model">
          <h2>Business safety rules</h2>
          <p>Every CRM-owned record belongs to one business. Credentials are encrypted before storage.</p>
          <ul className={styles.list}>
            {metaCoexistenceLimitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <pre className={styles.code}>{JSON.stringify({ missingRecommendedEnv: missingEnv }, null, 2)}</pre>
        </div>
      </section>
    </main>
  );
}
