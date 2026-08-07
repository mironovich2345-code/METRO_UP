import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton. `DATABASE_URL` is read by Prisma from the
 * environment (Railway) and is never hardcoded, logged, or sent to the client.
 * Connection is lazy — constructing the client does not open a connection.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
