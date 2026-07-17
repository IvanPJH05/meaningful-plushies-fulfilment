export const CRM_DEFAULT_BUSINESS_SLUG = "meaningful-plushies";

export const CRM_DEFAULT_BUSINESS_NAME = "Meaningful Plushies";

export const CRM_PHASES = [
  "Phase 1: foundations",
  "Phase 2: paid-first manual order commands",
  "Phase 3: WhatsApp inbox and AI assistant",
  "Phase 4: checkout, follow-up, and reporting automation",
] as const;

export const CRM_LEAD_STAGES = [
  "NEW",
  "QUALIFYING",
  "READY_TO_ORDER",
  "CHECKOUT_SENT",
  "PAID",
  "FULFILMENT",
  "LOST",
] as const;

export const CRM_AI_MODES = ["OFF", "SUGGEST_ONLY", "AUTO_REPLY"] as const;

export const CRM_WORKSPACE_NAV = [
  { label: "Dashboard", href: "/crm" },
  { label: "Connections", href: "/crm#connections" },
  { label: "Tenant model", href: "/crm#tenant-model" },
  { label: "Meta setup", href: "/crm#meta-setup" },
] as const;
