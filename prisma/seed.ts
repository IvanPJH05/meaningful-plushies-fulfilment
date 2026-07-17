import { PrismaClient } from "@prisma/client";
import { CRM_DEFAULT_BUSINESS_NAME, CRM_DEFAULT_BUSINESS_SLUG } from "../src/shared/constants/crm.ts";
import { hashPassword } from "../src/modules/auth/password.ts";

const prisma = new PrismaClient();

async function main() {
  const business = await prisma.business.upsert({
    where: { slug: CRM_DEFAULT_BUSINESS_SLUG },
    update: {},
    create: {
      slug: CRM_DEFAULT_BUSINESS_SLUG,
      name: CRM_DEFAULT_BUSINESS_NAME,
    },
  });

  const email = process.env.CRM_SEED_ADMIN_EMAIL;
  const password = process.env.CRM_SEED_ADMIN_PASSWORD;

  if (email && password) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        displayName: "CRM Admin",
        passwordHash: await hashPassword(password),
      },
    });

    await prisma.userBusinessRole.upsert({
      where: {
        businessId_userId: {
          businessId: business.id,
          userId: user.id,
        },
      },
      update: { role: "OWNER" },
      create: {
        businessId: business.id,
        userId: user.id,
        role: "OWNER",
      },
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
