import { prisma } from "@/src/infrastructure/database/prisma";
import { CRM_DEFAULT_BUSINESS_NAME, CRM_DEFAULT_BUSINESS_SLUG } from "@/src/shared/constants/crm";

export async function ensureDefaultBusiness() {
  return prisma.business.upsert({
    where: { slug: CRM_DEFAULT_BUSINESS_SLUG },
    update: {},
    create: {
      slug: CRM_DEFAULT_BUSINESS_SLUG,
      name: CRM_DEFAULT_BUSINESS_NAME,
    },
  });
}
