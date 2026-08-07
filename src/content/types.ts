/**
 * Metro UP — training content model.
 *
 * Pure, serialisable data types (no React / no icon components) so the content
 * layer can later be sourced from an API or CMS without touching the UI. Icons
 * are referenced by name and resolved to components in the presentation layer.
 */

/* --------------------------------- Access -------------------------------- */

/** Which audience a piece of content is unlocked for. */
export type AccessLevel = "onboarding" | "advanced";

/** Publication status of authored content. */
export type PublishStatus = "DRAFT" | "PUBLISHED";

/**
 * Runtime progress state of a lesson / day / program, shown in the UI.
 * - available            — доступно
 * - completed            — завершено
 * - locked               — заблокировано
 * - awaiting_attestation — ожидает аттестации
 * - awaiting_approval    — ожидает одобрения управляющего
 */
export type ContentState =
  | "available"
  | "completed"
  | "locked"
  | "awaiting_attestation"
  | "awaiting_approval";

/* ------------------------------ Lesson blocks ---------------------------- */

export type LessonBlockType =
  | "VIDEO"
  | "TEXT"
  | "IMAGE"
  | "INFO_CARD"
  | "CHECKLIST"
  | "EQUIPMENT_CARD"
  | "GROUP_CLASS_CARD"
  | "QUIZ"
  | "SUMMARY";

interface BaseBlock {
  id: string;
  type: LessonBlockType;
}

export interface VideoBlock extends BaseBlock {
  type: "VIDEO";
  url: string;
  caption?: string;
}
export interface TextBlock extends BaseBlock {
  type: "TEXT";
  text: string;
}
export interface ImageBlock extends BaseBlock {
  type: "IMAGE";
  src: string;
  alt: string;
  caption?: string;
}
export interface InfoCardBlock extends BaseBlock {
  type: "INFO_CARD";
  title: string;
  body: string;
  icon?: string;
}
export interface ChecklistBlock extends BaseBlock {
  type: "CHECKLIST";
  title?: string;
  items: string[];
}
export interface EquipmentCardBlock extends BaseBlock {
  type: "EQUIPMENT_CARD";
  /** References Equipment.id */
  equipmentId: string;
}
export interface GroupClassCardBlock extends BaseBlock {
  type: "GROUP_CLASS_CARD";
  /** References GroupClass.id */
  groupClassId: string;
}
export interface QuizBlock extends BaseBlock {
  type: "QUIZ";
  /** References Quiz.id */
  quizId: string;
}
export interface SummaryBlock extends BaseBlock {
  type: "SUMMARY";
  points: string[];
}

export type LessonBlock =
  | VideoBlock
  | TextBlock
  | ImageBlock
  | InfoCardBlock
  | ChecklistBlock
  | EquipmentCardBlock
  | GroupClassCardBlock
  | QuizBlock
  | SummaryBlock;

/* --------------------------------- Quiz ---------------------------------- */

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  /** Index into `options`. */
  correctIndex: number;
  explanation?: string;
}

export interface Quiz {
  id: string;
  slug: string;
  title: string;
  /** Percent (0–100) required to pass. */
  passingScore: number;
  /** Marks the final attestation quiz (manager approval follows). */
  isAttestation?: boolean;
  questions: QuizQuestion[];
}

/* -------------------------------- Lesson --------------------------------- */

export interface Lesson {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  durationMinutes: number;
  xpReward: number;
  isRequired: boolean;
  accessLevel: AccessLevel;
  /** Position within its day (1-based). */
  order: number;
  coverImage?: string;
  videoUrl?: string;
  blocks: LessonBlock[];
  /** Present on test / attestation lessons. */
  quiz?: Quiz;
  status: PublishStatus;
}

/* ------------------------------ Program tree ----------------------------- */

export interface TrainingDay {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  /** Icon name resolved in the UI layer. */
  icon: string;
  /** Position within its program (1-based). */
  order: number;
  /** Rough time budget for the whole day (~15 min). */
  estimatedMinutes: number;
  /** References Lesson.id, in order. */
  lessonIds: string[];
}

export interface TrainingProgram {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  accessLevel: AccessLevel;
  order: number;
  status: PublishStatus;
  days: TrainingDay[];
}

/**
 * Broader Academy track. The base adaptation is delivered as a TrainingProgram;
 * Courses describe the wider curriculum that unlocks after attestation.
 */
export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  accent: string;
  accessLevel: AccessLevel;
  order: number;
  status: PublishStatus;
  /** References Lesson.id (empty while the track is still authored). */
  lessonIds: string[];
  /** Number of lessons planned, for locked previews. */
  plannedLessons: number;
}

/* ------------------------------ Supporting ------------------------------- */

export interface Equipment {
  id: string;
  slug: string;
  name: string;
  zone: string;
  summary: string;
  icon: string;
}

export interface GroupClass {
  id: string;
  slug: string;
  name: string;
  intensity: "low" | "medium" | "high";
  durationMinutes: number;
  summary: string;
  icon: string;
}

// City/Club now live in @/content/cities (real network model).

export interface Achievement {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
}
