/**
 * Career domain — the employee's development path inside MetroFitness.
 *
 * Career progression is requirement-based and INDEPENDENT of XP and of the
 * monthly rating. Levels here are in-app levels, not real job positions.
 */

export type CareerLevelId =
  | "NEWCOMER"
  | "MANAGER"
  | "TOP_MANAGER"
  | "LEADER"
  | "MANAGER_PRO";

/** A single requirement that must be met to advance to a level. */
export interface CareerRequirement {
  id: string;
  label: string;
  done: boolean;
}

/** A resolved career level (definition + this employee's progress against it). */
export interface CareerLevel {
  id: CareerLevelId;
  title: string;
  description: string;
  requiredItems: CareerRequirement[];
  /** Percent of requirements that must be met to unlock the NEXT level. */
  requiredPercent: number;
  icon: string;
  color: string;
  /** Whether the employee has reached (unlocked) this level. */
  isUnlocked: boolean;
}

/** Computed progress of an employee along the career path. */
export interface CareerProgress {
  levels: CareerLevel[];
  currentLevel: CareerLevel;
  nextLevel: CareerLevel | null;
  /** 0–1 progress toward the next level (met requirements / required). */
  ratio: number;
  completedRequirements: number;
  totalRequirements: number;
}

/** Per-employee career state (would come from the backend later). */
export interface CareerState {
  currentLevelId: CareerLevelId;
  /** Requirement ids the employee has completed. */
  completedRequirementIds: string[];
}
