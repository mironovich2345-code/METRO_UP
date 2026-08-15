/**
 * Metric interaction routing (pure — no server-only, unit testable). A light
 * server-side heuristic + the conversation's role-play state pick the mode; no
 * extra LLM call. The chosen mode drives the system-prompt behaviour and whether
 * file_search retrieval runs. When in doubt, ANSWER + retrieval (grounding-safe).
 */
export type MetricMode = "ANSWER" | "ASSIST" | "ROLE_PLAY" | "ROLE_PLAY_START" | "REVIEW";

export interface RolePlayState {
  active: boolean;
  scenario?: string | null;
}

export interface ModeDecision {
  mode: MetricMode;
  /** A pure text transformation (rewrite/shorten) that needs no corporate facts. */
  transform: boolean;
  /** The user explicitly asked for a detailed/long answer. */
  detailed: boolean;
}

const START_RP: RegExp[] = [
  /потренир/i, /тренир(овк|уем)/i, /давай.*(отработа|поигра|сыгра)/i,
  /я\s+менеджер.*ты\s+клиент/i, /ты\s+клиент.*я\s+менеджер/i,
  /сыгра(й|ем).*клиент/i, /поигра(ем|ть).*клиент/i, /б%у?дь\s+клиент/i,
  /отработа(ем|ть).*(дорого|возражени|пробн|входящ|карт|продлени)/i, /ролев(ая|ую)\s+игр/i,
];
const EXIT_RP: RegExp[] = [
  /\bстоп\b/i, /^стоп/i, /разбери/i, /как\s+я\s+справил/i, /дай.*обратн.*связ/i,
  /обратную\s+связь/i, /\bхватит\b/i, /закончим/i, /выйти\s+из\s+роли/i, /конец\s+тренировк/i,
];
const ASSIST: RegExp[] = [
  /что\s+ответ/i, /что\s+сказать/i, /как\s+ответ/i, /как\s+сказать/i, /как\s+лучше\s+сказать/i,
  /клиент\s+(говорит|сомнева|спрашива|не\s+хочет|против|возража|думает|уходит)/i,
  /как.*закрыть/i, /как\s+реагир/i, /помоги\s+ответить/i, /что\s+делать\s+с\s+клиент/i,
  /как\s+ответить\s+на\s+это/i, /что\s+написать\s+клиент/i,
];
const TRANSFORM: RegExp[] = [
  /сократи/i, /переформул/i, /перепиши/i, /сделай.*(короче|компактн)/i, /исправь.*текст/i,
  /перефраз/i, /сделай\s+короче/i, /убери\s+лишн/i,
];
const DETAILED: RegExp[] = [
  /подробн/i, /расскажи\s+вс[её]/i, /объясни\s+подробн/i, /поподробн/i, /развернут/i, /детальн/i, /полн(ый|ую)\s+разбор/i,
];

function anyMatch(list: RegExp[], t: string): boolean {
  return list.some((r) => r.test(t));
}

export function classifyMode(text: string, rp: RolePlayState | null | undefined): ModeDecision {
  const t = text.trim();
  const transform = anyMatch(TRANSFORM, t);
  const detailed = anyMatch(DETAILED, t);

  if (rp?.active) {
    if (anyMatch(EXIT_RP, t)) return { mode: "REVIEW", transform: false, detailed };
    return { mode: "ROLE_PLAY", transform: false, detailed: false };
  }
  if (anyMatch(START_RP, t)) return { mode: "ROLE_PLAY_START", transform: false, detailed: false };
  if (anyMatch(ASSIST, t)) return { mode: "ASSIST", transform, detailed };
  return { mode: "ANSWER", transform, detailed };
}

/**
 * Whether this turn must run file_search retrieval. Skipped only for a client
 * role-play turn or a pure text transform — everything else retrieves (corporate
 * facts, scripts, standards, review evaluation). Access filtering is applied
 * separately whenever retrieval runs.
 */
export function needsRetrieval(mode: MetricMode, transform: boolean): boolean {
  if (mode === "ROLE_PLAY") return false; // client reply only — no corporate facts
  if (mode === "ANSWER" && transform) return false; // pure rewrite/shorten
  return true; // ANSWER, ASSIST, ROLE_PLAY_START, REVIEW
}

/** Role-play state transition after a turn of the given mode. */
export function nextRolePlayState(mode: MetricMode, prev: RolePlayState | null | undefined): RolePlayState | null {
  if (mode === "ROLE_PLAY_START") return { active: true, scenario: null };
  if (mode === "REVIEW") return { active: false };
  return prev ?? null;
}

/** Read the role-play sub-state from a conversation's JSON `state` (defensive). */
export function readRolePlayState(state: unknown): RolePlayState | null {
  if (state && typeof state === "object" && "rolePlay" in state) {
    const rp = (state as { rolePlay?: unknown }).rolePlay;
    if (rp && typeof rp === "object") {
      const o = rp as { active?: unknown; scenario?: unknown };
      return { active: o.active === true, scenario: typeof o.scenario === "string" ? o.scenario : null };
    }
  }
  return null;
}

/** Merge a role-play state into the conversation's JSON `state` object. */
export function writeRolePlayState(state: unknown, rp: RolePlayState | null): Record<string, unknown> {
  const base: Record<string, unknown> = state && typeof state === "object" ? { ...(state as Record<string, unknown>) } : {};
  if (rp && rp.active) base.rolePlay = { active: true, scenario: rp.scenario ?? null };
  else delete base.rolePlay;
  return base;
}

export function rolePlayEqual(a: RolePlayState | null, b: RolePlayState | null): boolean {
  return (a?.active ?? false) === (b?.active ?? false) && (a?.scenario ?? null) === (b?.scenario ?? null);
}
