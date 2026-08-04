import type { Rank, RankId } from "./types";

/** The MetroFitness career ladder. Order matters — ascending by minXp. */
export const RANKS: Rank[] = [
  {
    id: "novice",
    title: "Новичок",
    minXp: 0,
    tagline: "Первые шаги в команде Metro",
  },
  {
    id: "manager",
    title: "Менеджер",
    minXp: 1200,
    tagline: "Уверенно ведёшь клиента",
  },
  {
    id: "top-manager",
    title: "ТОП Менеджер",
    minXp: 3200,
    tagline: "В числе лучших по продажам",
  },
  {
    id: "leader",
    title: "Лидер",
    minXp: 6000,
    tagline: "За тобой идёт команда",
  },
  {
    id: "director",
    title: "Управляющий",
    minXp: 10000,
    tagline: "Ты создаёшь стандарт Metro",
  },
];

export interface RankProgress {
  current: Rank;
  next: Rank | null;
  /** XP earned within the current rank band. */
  xpIntoRank: number;
  /** XP span of the current rank band (0 when max rank). */
  xpForRank: number;
  /** 0..1 progress toward the next rank. */
  ratio: number;
  /** Absolute XP still required to promote (0 at max rank). */
  xpToNext: number;
  levelIndex: number;
}

/** Resolve a total XP value into structured rank progress. */
export function getRankProgress(totalXp: number): RankProgress {
  const xp = Math.max(0, Math.floor(totalXp));
  let index = 0;
  for (let i = 0; i < RANKS.length; i += 1) {
    if (xp >= RANKS[i].minXp) index = i;
  }

  const current = RANKS[index];
  const next = RANKS[index + 1] ?? null;

  if (!next) {
    return {
      current,
      next: null,
      xpIntoRank: xp - current.minXp,
      xpForRank: 0,
      ratio: 1,
      xpToNext: 0,
      levelIndex: index,
    };
  }

  const xpForRank = next.minXp - current.minXp;
  const xpIntoRank = xp - current.minXp;

  return {
    current,
    next,
    xpIntoRank,
    xpForRank,
    ratio: Math.min(1, xpIntoRank / xpForRank),
    xpToNext: next.minXp - xp,
    levelIndex: index,
  };
}

export function getRankById(id: RankId): Rank {
  return RANKS.find((r) => r.id === id) ?? RANKS[0];
}
