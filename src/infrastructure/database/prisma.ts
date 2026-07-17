import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  crmPrisma?: PrismaClient;
};

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const adapter = new PrismaPg({ connectionString });

export const prisma =
  globalForPrisma.crmPrisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.crmPrisma = prisma;
}
