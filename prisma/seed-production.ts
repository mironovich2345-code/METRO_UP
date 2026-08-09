import { PrismaClient } from "@prisma/client";
import { ACHIEVEMENT_CATALOG } from "../src/lib/server/achievements-catalog";
import { DAILY_TEMPLATES } from "../src/lib/server/daily-plan-catalog";

/**
 * MANUAL, idempotent seed of production reference data: achievement definitions
 * and daily-task templates. Not wired to `prisma db seed`. These are also
 * self-provisioned lazily at runtime (award / first plan fetch), so this seed is
 * optional — it just pre-populates the catalogs. Run: tsx prisma/seed-production.ts
 */
const prisma = new PrismaClient();

async function main() {
  for (const a of ACHIEVEMENT_CATALOG) {
    await prisma.achievementDefinition.upsert({
      where: { code: a.code },
      update: { title: a.title, description: a.description, category: a.category, icon: a.icon },
      create: { code: a.code, title: a.title, description: a.description, category: a.category, icon: a.icon },
    });
  }
  for (const t of DAILY_TEMPLATES) {
    await prisma.dailyTaskTemplate.upsert({
      where: { code: t.code },
      update: { title: t.title, description: t.description, category: t.category, position: t.position, defaultOrder: t.defaultOrder },
      create: { code: t.code, title: t.title, description: t.description, category: t.category, position: t.position, defaultOrder: t.defaultOrder },
    });
  }
  console.log(`Seeded ${ACHIEVEMENT_CATALOG.length} achievements, ${DAILY_TEMPLATES.length} daily templates.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("seed-production failed:", e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
