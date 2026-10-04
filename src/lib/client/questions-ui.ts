import type { QuestionCategoryDTO, QuestionStatusDTO } from "@/lib/api/questions-types";
import { QUESTION_CATEGORY_OPTIONS } from "./ask-question-core";

/**
 * METRO UP ROUND 1, Milestone 3 — pure display helpers for the questions
 * inbox list/detail UI. Client-safe (no "server-only" import anywhere in
 * its chain) — kept beside ask-question-core.ts rather than importing
 * anything from src/lib/server/questions/* into a "use client" page.
 */

export const QUESTION_STATUS_TABS: { value: QuestionStatusDTO | "ALL"; label: string }[] = [
  { value: "ALL", label: "Все" },
  { value: "NEW", label: "Новые" },
  { value: "IN_PROGRESS", label: "В работе" },
  { value: "CLOSED", label: "Закрытые" },
];

export function questionStatusLabel(status: QuestionStatusDTO): string {
  switch (status) {
    case "NEW":
      return "Новый";
    case "IN_PROGRESS":
      return "В работе";
    case "CLOSED":
      return "Закрыт";
  }
}

/** Badge variant for each status — matches components/ui/badge.tsx's own
 * variant names, never a raw color literal here. */
export function questionStatusBadgeVariant(status: QuestionStatusDTO): "brand" | "outline" | "success" {
  switch (status) {
    case "NEW":
      return "brand";
    case "IN_PROGRESS":
      return "outline";
    case "CLOSED":
      return "success";
  }
}

export function questionCategoryLabel(category: QuestionCategoryDTO): string {
  return QUESTION_CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category;
}

/**
 * Milestone 3, section 8 — which status buttons the detail page offers: one
 * FORWARD step (primary) and, where sensible, one CORRECTION step back.
 * Mirrors questions-core.ts's allowedStatusTransitions (server-only file,
 * not importable here) — UI guidance only; the PATCH route's own
 * canChangeQuestionStatus check is the real, only authority, and accepts
 * any of the three statuses regardless of what this suggests.
 */
export function questionStatusTransitions(current: QuestionStatusDTO): { forward: QuestionStatusDTO | null; correction: QuestionStatusDTO | null } {
  switch (current) {
    case "NEW":
      return { forward: "IN_PROGRESS", correction: null };
    case "IN_PROGRESS":
      return { forward: "CLOSED", correction: "NEW" };
    case "CLOSED":
      return { forward: null, correction: "IN_PROGRESS" };
  }
}

export function questionStatusActionLabel(target: QuestionStatusDTO): string {
  switch (target) {
    case "NEW":
      return "Вернуть в «Новые»";
    case "IN_PROGRESS":
      return "Взять в работу";
    case "CLOSED":
      return "Закрыть";
  }
}
