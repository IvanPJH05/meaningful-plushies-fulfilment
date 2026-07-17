import styles from "./page.module.css";
import { CRM_AI_MODES, CRM_LEAD_STAGES, CRM_PHASES } from "@/src/shared/constants/crm";
import {
  metaCoexistenceLimitations,
  metaCoexistenceManualSetupSteps,
} from "@/src/modules/onboarding/meta-coexistence";
import { paidManualOrderPhase2Policy } from "@/src/modules/sales/paid-manual-order-flow";
import { getMissingPhase1Env, getMissingPhase2Env } from "@/src/shared/validation/env";

export default function CrmPhaseOnePage() {
  const missingEnv = getMissingPhase1Env();
  const missingPhase2Env = getMissingPhase2Env();

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.eyebrow}>WhatsApp CRM Workspace</div>
        <h1 className={styles.title}>Meaningful Plushies AI Sales CRM</h1>
        <p className={styles.subtitle}>
          Phase 2 starts the paid-first sales flow beside the current fulfilment app: WhatsApp webhooks,
          AI command logging, and a guarded manual-order command that only runs after payment is confirmed.
        </p>
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
        <div className={styles.card}>
          <p className={styles.cardTitle}>Phase 2 readiness</p>
          <p className={styles.cardValue}>{missingPhase2Env.length === 0 ? "Ready" : `${missingPhase2Env.length} missing`}</p>
        </div>
      </section>

      <section className={styles.sectionGrid}>
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
            commandEndpoint: "/api/crm/ai/commands/manual-order",
            webhookEndpoint: "/api/crm/whatsapp/webhook",
            missingPhase2Env,
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
