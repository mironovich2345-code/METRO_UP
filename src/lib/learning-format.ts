/**
 * Presentation helpers for the Learning CMS (pure — no React/server, so unit
 * testable). These make the technical Program → Day → Course → Lesson hierarchy
 * read like plain Russian, without ever exposing ids or duplicated labels.
 */

/** Russian plural: pick [one, few, many] by count (1 урок / 2 урока / 5 уроков). */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

export const lessonsWord = (n: number) => plural(n, ["урок", "урока", "уроков"]);
export const daysWord = (n: number) => plural(n, ["день", "дня", "дней"]);
export const sectionsWord = (n: number) => plural(n, ["раздел", "раздела", "разделов"]);
export const minutesWord = (n: number) => plural(n, ["минута", "минуты", "минут"]);

/**
 * A day's human label. `dayNumber` is the ordinal; `title` is the editable name.
 * Never renders "День 1 · День 1": when the stored title is empty or is itself
 * just the ordinal ("День 1"), only the ordinal is shown. Otherwise it reads
 * "День 1 — Знакомство с MetroFitness".
 */
export function formatDayLabel(dayNumber: number, title: string | null | undefined): string {
  const ordinal = `День ${dayNumber}`;
  const t = (title ?? "").trim();
  if (!t) return ordinal;
  // Title that is just an ordinal ("День 1", "день  2") → do not duplicate.
  if (/^день\s*\d+$/i.test(t)) return ordinal;
  return `${ordinal} — ${t}`;
}

/** True when a day's stored title still needs a real name (legacy/default). */
export function dayNeedsTitle(dayNumber: number, title: string | null | undefined): boolean {
  const t = (title ?? "").trim();
  return t === "" || /^день\s*\d+$/i.test(t) || t.toLowerCase() === `день ${dayNumber}`.toLowerCase();
}
