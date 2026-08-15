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
