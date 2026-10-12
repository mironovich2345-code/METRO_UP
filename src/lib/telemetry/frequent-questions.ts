/**
 * Sprint: LIVE QA QA-07 — «Частые вопросы Метрику» v1 (pure; unit-tested).
 *
 * Exact grouping of employee prompts after a conservative normalization —
 * no AI clustering, no stemming, no rewriting:
 *   - Unicode NFKC, ё → е;
 *   - lowercase with the Russian locale;
 *   - sentence/quote punctuation at the start/end removed («Как оформить возврат?!»
 *     → «как оформить возврат»);
 *   - no space before inner punctuation, one space after it;
 *   - whitespace collapsed and trimmed.
 * Different wording stays different («Как оформить возврат?» vs «Как
 * отменить договор?»). Each group is shown with a REAL original text (its
 * most common cleaned variant; ties → the most recent), never the
 * lowercase key.
 */

export const FREQUENT_QUESTIONS_HOME_LIMIT = 5;
export const FREQUENT_QUESTIONS_PAGE_LIMIT = 10;
/** Upper bound of USER prompts processed per request (newest first). */
export const FREQUENT_QUESTIONS_ROW_BOUND = 5000;

/** Sentence/quote punctuation only — «%», «)», «№» etc. carry meaning and stay. */
const EDGE_PUNCT = /^[\s.,;:!?…"'«»„“”‘’`*_~–—-]+|[\s.,;:!?…"'«»„“”‘’`*_~–—-]+$/gu;

export function normalizeQuestion(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/\s+/gu, " ")
    .replace(EDGE_PUNCT, "")
    .replace(/\s+([,.;:!?…)\]»])/gu, "$1")
    .replace(/([,;:!?…])(?=[^\s,.;:!?…])/gu, "$1 ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** The original text as displayed: whitespace tidied, wording/case untouched. */
function cleanDisplay(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

export interface FrequentQuestion {
  question: string;
  count: number;
}

/**
 * `rows` must be USER prompts NEWEST FIRST (the query's order). Ordering:
 * count desc, then the normalized key ascending (code-unit order) — fully
 * deterministic.
 */
export function groupFrequentQuestions(rows: Array<{ content: string }>, limit: number): FrequentQuestion[] {
  const groups = new Map<string, { count: number; variants: Map<string, { n: number; firstSeen: number }> }>();
  rows.forEach((row, i) => {
    const key = normalizeQuestion(row.content);
    if (!key) return;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { count: 0, variants: new Map() }));
    g.count += 1;
    const display = cleanDisplay(row.content);
    const v = g.variants.get(display);
    if (v) v.n += 1;
    else g.variants.set(display, { n: 1, firstSeen: i });
  });
  return [...groups.entries()]
    .sort(([ka, a], [kb, b]) => b.count - a.count || (ka < kb ? -1 : ka > kb ? 1 : 0))
    .slice(0, Math.max(0, limit))
    .map(([, g]) => {
      let best: [string, { n: number; firstSeen: number }] | null = null;
      for (const entry of g.variants) {
        if (!best || entry[1].n > best[1].n || (entry[1].n === best[1].n && entry[1].firstSeen < best[1].firstSeen)) best = entry;
      }
      return { question: best![0], count: g.count };
    });
}
