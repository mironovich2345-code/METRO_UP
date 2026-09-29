/**
 * Client-safe content DTOs (mirror server mappers). The employee player never
 * receives quiz answer keys (`isCorrect`) or explanations before submission.
 */

import type { RichDoc } from "@/lib/server/content-schemas";

export type InfoCardVariant = "DEFAULT" | "TIP" | "IMPORTANT" | "WARNING";
export type TakeawayVariant = "DEFAULT" | "IMPORTANT" | "TIP";
export type ContentStatusDTO = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ProgressStatusDTO = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export type QuestionTypeDTO = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";

/** A block as rendered to the employee — media ids resolved to delivery URLs. */
export type LessonBlockDTO =
  | { id: string; type: "VIDEO"; order: number; url: string | null; posterUrl: string | null; caption: string | null }
  | { id: string; type: "IMAGE"; order: number; url: string | null; alt: string | null; caption: string | null }
  | { id: string; type: "TEXT"; order: number; doc: RichDoc }
  | { id: string; type: "COLLAPSIBLE_TEXT"; order: number; title: string; doc: RichDoc; defaultExpanded: boolean }
  | { id: string; type: "KEY_TAKEAWAYS"; order: number; title: string; items: TakeawayItemDTO[] }
  | { id: string; type: "INFO_CARD"; order: number; title: string; text: string; variant: InfoCardVariant }
  | { id: string; type: "CHECKLIST"; order: number; title: string | null; items: { text: string }[] }
  | { id: string; type: "SUMMARY"; order: number; title: string | null; points: string[] };

export interface TakeawayItemDTO {
  id: string;
  title: string;
  text: string;
  icon: string | null;
  variant: TakeawayVariant;
}

export interface PublicQuizOptionDTO {
  id: string;
  text: string;
  order: number;
}
export interface PublicQuizQuestionDTO {
  id: string;
  text: string;
  type: QuestionTypeDTO;
  order: number;
  options: PublicQuizOptionDTO[];
}
/** Compact summary of the current user's most recent attempt (no answer keys). */
export interface LastQuizAttemptDTO {
  attemptNumber: number;
  scorePercent: number;
  passed: boolean;
}
export interface PublicQuizDTO {
  id: string;
  title: string;
  description: string | null;
  passingPercent: number;
  maxAttempts: number | null;
  attemptsUsed: number;
  xpReward: number;
  questions: PublicQuizQuestionDTO[];
  /** The current user's latest attempt, if any — for the reopen/refresh state. */
  lastAttempt: LastQuizAttemptDTO | null;
}

export interface LessonAccessDTO {
  locked: boolean;
  reason: string | null;
}

export interface LessonDetailDTO {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  durationMinutes: number;
  xpReward: number;
  isRequired: boolean;
  courseId: string;
  blocks: LessonBlockDTO[];
  quiz: PublicQuizDTO | null;
  progress: { status: ProgressStatusDTO; completedAt: string | null };
  access: LessonAccessDTO;
  next: { slug: string; title: string } | null;
  /** True for CMS preview — completion/XP/progress writes are disabled. */
  preview: boolean;
}

export interface QuizQuestionResultDTO {
  questionId: string;
  correct: boolean;
  correctOptionIds: string[];
  explanation: string | null;
}
export interface QuizSubmitResultDTO {
  attemptNumber: number;
  scorePercent: number;
  passed: boolean;
  lessonCompleted: boolean;
  xpAwarded: number;
  results: QuizQuestionResultDTO[];
}

export interface LessonCompleteResultDTO {
  lessonCompleted: boolean;
  xpAwarded: number;
  next: { slug: string; title: string } | null;
}

export interface XPBalanceDTO {
  total: number;
  today: number;
  recent: { amount: number; reason: string; createdAt: string }[];
}

/** Compact per-lesson state used to drive the Academy list from the DB. */
export interface AcademyLessonStateDTO {
  lessonId: string;
  slug: string;
  title: string;
  status: ProgressStatusDTO;
  locked: boolean;
}
export interface AcademyStateDTO {
  lessons: AcademyLessonStateDTO[];
  nextLesson: { slug: string; title: string } | null;
  xpTotal: number;
}

/* ---------------------- structured Academy (DB-driven) ------------------- */

export interface AcademyDayCardDTO {
  id: string;
  title: string;
  dayNumber: number;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  durationMinutes: number;
  locked: boolean;
  /** True for the synthetic "Уроки" bucket holding lessons with no TrainingDay. */
  virtual: boolean;
}
export interface AcademyProgramDTO {
  id: string;
  title: string;
  days: AcademyDayCardDTO[];
}
export interface AcademyOverviewDTO {
  hasContent: boolean;
  programExists: boolean;
  programs: AcademyProgramDTO[];
  overall: { completed: number; total: number; ratio: number };
  nextLesson: { slug: string; title: string } | null;
  xpTotal: number;
}

/**
 * Sprint: manual-test-round-2, section 4 — Academy role sections. Same three
 * values as the Mini App's HomeContextType (minus PERSONAL, which maps to
 * MANAGER here — "Личный кабинет" trains as a MANAGER). A higher role's
 * `allowedSections` includes every role below it (CITY_MANAGER ⊇
 * CLUB_MANAGER ⊇ MANAGER), but each section is its own separate, non-merged
 * tab — never a combined list (see academy.ts's resolveAcademyProgramIdsForSection).
 */
export type AcademyTargetRoleDTO = "MANAGER" | "CLUB_MANAGER" | "CITY_MANAGER";

/** Present on GET /api/academy/overview and /api/academy/state responses
 * only for LIMITED/FULL (never PENDING_APPROVAL's onboarding path, which has
 * no section concept) — `allowedSections` drives the tab UI, `activeSection`
 * is whichever section this specific response's content was filtered to
 * (the server's own resolved choice, echoed back exactly like Home's
 * activeContext — never trust a client-persisted value without this). */
export interface AcademySectionsDTO {
  allowedSections: AcademyTargetRoleDTO[];
  activeSection: AcademyTargetRoleDTO;
}

/**
 * Sprint: manual-test-round-3, section 5C — the most detailed per-employee
 * learning view CURRENT schema genuinely supports (audited: LessonProgress
 * gives per-lesson status/completedAt; QuizAttempt gives a per-lesson score/
 * pass, latest attempt only; TrainingProgram/Day/Course/Lesson give the
 * structure). Deliberately does NOT include due dates, mandatory/overdue
 * status, time-spent, or any score that isn't a real QuizAttempt row — none
 * of that exists in the data model, so none of it is fabricated here.
 */
export interface EmployeeTrainingLessonDTO {
  id: string;
  slug: string;
  title: string;
  dayNumber: number;
  isRequired: boolean;
  durationMinutes: number;
  completed: boolean;
  completedAt: string | null;
  /** null when the lesson has no quiz, or the employee has no attempt yet —
   * never a fabricated score. */
  quiz: { scorePercent: number; passed: boolean } | null;
}
export interface EmployeeTrainingProgramDTO {
  id: string;
  title: string;
  completedLessons: number;
  totalLessons: number;
  lessons: EmployeeTrainingLessonDTO[];
}
export interface EmployeeTrainingDetailDTO {
  displayName: string;
  position: string | null;
  programs: EmployeeTrainingProgramDTO[];
  overall: { completed: number; total: number };
}

export interface AcademyLessonRowDTO {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  durationMinutes: number;
  xpReward: number;
  isRequired: boolean;
  completed: boolean;
  locked: boolean;
}
export interface AcademyCourseDTO {
  id: string;
  title: string;
  shortDescription: string | null;
  lessons: AcademyLessonRowDTO[];
}
export interface AcademyDayDetailDTO {
  id: string;
  title: string;
  description: string | null;
  dayNumber: number;
  programTitle: string;
  courses: AcademyCourseDTO[];
}
