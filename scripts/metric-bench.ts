/**
 * Metric latency benchmark runner (standalone; NOT part of the app request flow).
 *
 *   npm run metric:bench
 *
 * Reads the SAME env as production (OPENAI_API_KEY / OPENAI_MODEL /
 * OPENAI_VECTOR_STORE_ID) but NEVER writes or changes any default — it only issues
 * read-only streaming requests and measures them. The key is never printed.
 *
 * It sweeps, on the fixed smoke set:
 *   - history window: 12 / 6 / 4 / 2   (retrieval fixed at 6)
 *   - retrieval results: 6 / 4 / 3      (history fixed at 6)
 *   - models: BENCH_MODELS="a,b,c" (comma-separated real model ids) or the current
 *             OPENAI_MODEL only. No model names are invented.
 *
 * Output is a plain table: model, history, retrieval, item, firstDeltaMs, totalMs,
 * inputTokens, outputTokens, retrievalUsed. Use it to fill the latency report and
 * decide whether to change any production default.
 */
import { getMetricEnv } from "@/lib/server/metric/env";
import { httpTransport, type ChatMessage, type CreateResponseInput } from "@/lib/server/metric/openai";
import { buildSystemInstructions, type EmployeeContext } from "@/lib/server/metric/instructions";
import { retrievalFilter } from "@/lib/server/metric/access";
import { classifyMode, needsRetrieval, type RolePlayState } from "@/lib/server/metric/mode";
import { SMOKE_SET, HISTORY_VARIANTS, RETRIEVAL_VARIANTS, sliceHistory, type SmokeItem } from "@/lib/server/metric/bench-config";

const CTX: EmployeeContext = {
  displayName: "Benchmark", roleTitle: "Сотрудник", positionTitle: "Менеджер по работе с клиентами",
  cityName: "Екатеринбург", clubName: "Клуб 1", scriptsAllowed: true,
};

// Synthetic prior context so the follow-up item (5) and role-play turn (6) are meaningful.
const PRIOR: ChatMessage[] = [
  { role: "user", content: "Что входит в клубную карту?" },
  { role: "assistant", content: "В клубную карту входит доступ в клубы сети, тренажёрный зал и групповые занятия по расписанию." },
  { role: "user", content: "Давай потренируемся: ты клиент, я менеджер." },
  { role: "assistant", content: "Хорошо. Я посмотрел клуб, но для меня это дороговато." },
];

interface Row {
  model: string; history: number; retrieval: number; item: string;
  firstDeltaMs: number; totalMs: number; inTok: number | null; outTok: number | null; retrievalUsed: boolean;
}

async function runOne(model: string, historyN: number, retrievalK: number, item: SmokeItem): Promise<Row> {
  const env = getMetricEnv();
  const transport = httpTransport(env.apiKey!);

  const rp: RolePlayState | null = item.expectMode === "ROLE_PLAY" ? { active: true, scenario: null } : null;
  const decision = classifyMode(item.text, rp);
  const useFileSearch = needsRetrieval(decision.mode, decision.transform);

  const priorTail = sliceHistory(PRIOR, historyN);
  const messages: ChatMessage[] = [...priorTail, { role: "user", content: item.text }];

  const input: CreateResponseInput = {
    model,
    instructions: buildSystemInstructions(CTX, decision.mode, decision.detailed),
    messages,
    vectorStoreId: env.vectorStoreId!,
    filters: useFileSearch ? retrievalFilter("CLIENT_MANAGER") : undefined,
    maxOutputTokens: env.maxOutputTokens,
    maxNumResults: retrievalK,
    useFileSearch,
  };

  const t0 = Date.now();
  let firstDeltaMs = 0;
  const result = await transport.streamResponse(input, () => { if (!firstDeltaMs) firstDeltaMs = Date.now() - t0; });
  const totalMs = Date.now() - t0;
  return {
    model, history: historyN, retrieval: retrievalK, item: item.id,
    firstDeltaMs, totalMs, inTok: result.usage?.inputTokens ?? null, outTok: result.usage?.outputTokens ?? null,
    retrievalUsed: useFileSearch,
  };
}

function printTable(title: string, rows: Row[]) {
  console.log(`\n=== ${title} ===`);
  console.log(["model", "hist", "retr", "item", "firstMs", "totalMs", "inTok", "outTok", "rag"].join("\t"));
  for (const r of rows) {
    console.log([r.model, r.history, r.retrieval, r.item, r.firstDeltaMs, r.totalMs, r.inTok ?? "-", r.outTok ?? "-", r.retrievalUsed ? "y" : "n"].join("\t"));
  }
  const withRag = rows.filter((r) => r.retrievalUsed);
  const noRag = rows.filter((r) => !r.retrievalUsed);
  const avg = (xs: Row[], k: "firstDeltaMs" | "totalMs") => xs.length ? Math.round(xs.reduce((s, r) => s + r[k], 0) / xs.length) : 0;
  console.log(`avg firstDelta: retrieval=${avg(withRag, "firstDeltaMs")}ms  no-retrieval=${avg(noRag, "firstDeltaMs")}ms`);
}

async function main() {
  const env = getMetricEnv();
  if (!env.apiKey || !env.vectorStoreId) {
    console.error("[bench] Missing OPENAI_API_KEY or OPENAI_VECTOR_STORE_ID — set them (read-only) to run the benchmark. Nothing was changed.");
    process.exit(2);
  }
  const models = (process.env.BENCH_MODELS?.trim() || env.model).split(",").map((m) => m.trim()).filter(Boolean);
  console.log(`[bench] models=${models.join(", ")} (current OPENAI_MODEL=${env.model}); no production default is modified.`);

  // 1) History sweep (retrieval fixed at 6, current model) on a representative subset.
  const histRows: Row[] = [];
  for (const n of HISTORY_VARIANTS) {
    for (const item of SMOKE_SET.filter((i) => ["1-card", "3-expensive", "5-shorten", "6-roleplay-turn"].includes(i.id))) {
      histRows.push(await runOne(models[0], n, 6, item));
    }
  }
  printTable("HISTORY SWEEP (retrieval=6)", histRows);

  // 2) Retrieval sweep (history fixed at 6, current model) on corporate questions.
  const retrRows: Row[] = [];
  for (const k of RETRIEVAL_VARIANTS) {
    for (const item of SMOKE_SET.filter((i) => ["1-card", "2-appearance", "4-refund"].includes(i.id))) {
      retrRows.push(await runOne(models[0], 6, k, item));
    }
  }
  printTable("RETRIEVAL SWEEP (history=6)", retrRows);

  // 3) Model sweep (baseline config: history 6, retrieval 6) — full smoke set per model.
  const modelRows: Row[] = [];
  for (const model of models) {
    for (const item of SMOKE_SET) modelRows.push(await runOne(model, 6, 6, item));
  }
  printTable("MODEL SWEEP (history=6, retrieval=6)", modelRows);

  console.log("\n[bench] done. No env/default was modified.");
  process.exit(0);
}

void main();
