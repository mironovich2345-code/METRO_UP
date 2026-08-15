/**
 * Initial / manual Metric knowledge sync.
 *   npm run metric:sync
 *
 * - Requires DATABASE_URL and OPENAI_API_KEY in the environment.
 * - If OPENAI_VECTOR_STORE_ID is not set, it creates the store, prints the id,
 *   and exits — set that id in Railway and re-run (one vector store, reused).
 * - Otherwise it does an idempotent full sync of all PUBLISHED knowledge.
 *
 * Run with the react-server condition so the server-only modules resolve
 * (configured in the npm script).
 */
import { getMetricEnv } from "../src/lib/server/metric/env";
import { httpTransport } from "../src/lib/server/metric/openai";
import { fullSync } from "../src/lib/server/metric/knowledge-sync";
import { prisma } from "../src/lib/server/db";

async function main() {
  const env = getMetricEnv();
  if (!env.apiKey) {
    console.error("OPENAI_API_KEY is required.");
    process.exit(1);
  }
  const transport = httpTransport(env.apiKey);

  if (!env.vectorStoreId) {
    const { id } = await transport.createVectorStore("METRO_UP KNOWLEDGE");
    console.log("Created a vector store. Set this in Railway env, then re-run `npm run metric:sync`:");
    console.log(`OPENAI_VECTOR_STORE_ID=${id}`);
    await prisma.$disconnect();
    return;
  }

  console.log(`Syncing PUBLISHED knowledge → vector store ${env.vectorStoreId} ...`);
  const result = await fullSync({ transport, vectorStoreId: env.vectorStoreId });
  console.log(`Done. synced=${result.synced} removed=${result.removed}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  // Never print secrets or full payloads.
  console.error("metric:sync failed:", e?.name ?? "error");
  process.exit(1);
});
