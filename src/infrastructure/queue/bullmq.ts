import { Queue } from "bullmq";
import { getRedisClient } from "../redis/client.ts";

export const CRM_QUEUE_NAMES = {
  whatsappInbound: "crm:whatsapp-inbound",
  whatsappOutbound: "crm:whatsapp-outbound",
  followUps: "crm:follow-ups",
  aiRuns: "crm:ai-runs",
  shopifySync: "crm:shopify-sync",
} as const;

export type CrmQueueName = keyof typeof CRM_QUEUE_NAMES;

export function createCrmQueue(name: CrmQueueName): Queue {
  return new Queue(CRM_QUEUE_NAMES[name], {
    connection: getRedisClient(),
  });
}
