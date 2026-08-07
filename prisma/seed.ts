import { PrismaClient } from "@prisma/client";
import { CITIES } from "../src/content/cities";

/**
 * Idempotent seed of the MetroFitness network (22 cities / 50 clubs, no Moscow).
 * Uses upserts only — it never deletes user data and is safe to re-run.
 * The static list in src/content/cities is the seed definition; the DB is the
 * source of truth once seeded.
 */
const prisma = new PrismaClient();

async function main() {
  let cityCount = 0;
  let clubCount = 0;

  for (const city of CITIES) {
    await prisma.city.upsert({
      where: { id: city.id },
      update: { name: city.name, isActive: true },
      create: { id: city.id, name: city.name, isActive: true },
    });
    cityCount += 1;

    for (const club of city.clubs) {
      await prisma.club.upsert({
        where: { id: club.id },
        update: {
          cityId: city.id,
          name: club.name,
          address: club.address,
          landmark: club.landmark ?? null,
          isActive: club.isActive,
        },
        create: {
          id: club.id,
          cityId: city.id,
          name: club.name,
          address: club.address,
          landmark: club.landmark ?? null,
          isActive: club.isActive,
        },
      });
      clubCount += 1;
    }
  }

  console.log(
    `Seed complete (idempotent): ${cityCount} cities, ${clubCount} clubs. Moscow excluded.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Seed failed:", e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
