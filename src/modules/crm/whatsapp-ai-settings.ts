import { prisma } from "@/src/infrastructure/database/prisma";
import {
  defaultWhatsAppAssistantTraining,
  normalizeWhatsAppAssistantTraining,
  parseWhatsAppAssistantTraining,
  serializeWhatsAppAssistantTraining,
  whatsappAssistantConfigName,
  whatsappAssistantConfigVersion,
  type WhatsAppAssistantTraining,
} from "@/src/modules/openai/whatsapp-assistant";

export async function getWhatsAppAssistantTraining(businessId: string): Promise<WhatsAppAssistantTraining> {
  const config = await prisma.aiAgentConfig.findFirst({
    where: {
      businessId,
      name: whatsappAssistantConfigName,
    },
    orderBy: { version: "desc" },
    select: {
      enabled: true,
      requiresHumanReview: true,
      systemPrompt: true,
    },
  });

  if (!config) return defaultWhatsAppAssistantTraining;

  return normalizeWhatsAppAssistantTraining({
    ...parseWhatsAppAssistantTraining(config.systemPrompt),
    enabled: config.enabled,
    requiresHumanReview: config.requiresHumanReview,
  });
}

export async function saveWhatsAppAssistantTraining(
  businessId: string,
  input: Partial<WhatsAppAssistantTraining>,
) {
  const training = normalizeWhatsAppAssistantTraining(input);

  const config = await prisma.aiAgentConfig.upsert({
    where: {
      businessId_name_version: {
        businessId,
        name: whatsappAssistantConfigName,
        version: whatsappAssistantConfigVersion,
      },
    },
    update: {
      systemPrompt: serializeWhatsAppAssistantTraining(training),
      enabled: training.enabled,
      requiresHumanReview: training.requiresHumanReview,
      allowedToolNames: ["draft_reply"],
    },
    create: {
      businessId,
      name: whatsappAssistantConfigName,
      version: whatsappAssistantConfigVersion,
      systemPrompt: serializeWhatsAppAssistantTraining(training),
      enabled: training.enabled,
      requiresHumanReview: training.requiresHumanReview,
      allowedToolNames: ["draft_reply"],
    },
  });

  return {
    config,
    training,
  };
}
