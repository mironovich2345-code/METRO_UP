import { CAREER_LEVEL_DEFS, CURRENT_CAREER_STATE } from "./data";
import type { CareerLevel, CareerProgress, CareerState } from "./types";

export * from "./types";
export { CAREER_LEVEL_DEFS, CURRENT_CAREER_STATE } from "./data";

const ORDER = CAREER_LEVEL_DEFS.map((l) => l.id);

/**
 * Resolve the full career path for an employee: every level with its
 * requirement completion, unlock state, and progress toward the next level.
 * UI receives ready-to-render data.
 */
export function getCareerProgress(
  state: CareerState = CURRENT_CAREER_STATE,
): CareerProgress {
  const currentIndex = Math.max(0, ORDER.indexOf(state.currentLevelId));
  const done = new Set(state.completedRequirementIds);

  const levels: CareerLevel[] = CAREER_LEVEL_DEFS.map((def, i) => ({
    id: def.id,
    title: def.title,
    description: def.description,
    requiredPercent: def.requiredPercent,
    icon: def.icon,
    color: def.color,
    isUnlocked: i <= currentIndex,
    requiredItems: def.requirements.map((r) => ({
      ...r,
      done: done.has(r.id),
    })),
  }));

  const currentLevel = levels[currentIndex];
  const nextLevel = levels[currentIndex + 1] ?? null;

  const totalRequirements = currentLevel.requiredItems.length;
  const completedRequirements = currentLevel.requiredItems.filter(
    (r) => r.done,
  ).length;
  const ratio = totalRequirements
    ? completedRequirements / totalRequirements
    : 1;

  return {
    levels,
    currentLevel,
    nextLevel,
    ratio,
    completedRequirements,
    totalRequirements,
  };
}
