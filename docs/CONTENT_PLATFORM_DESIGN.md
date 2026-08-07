# Content Platform — Design (ADR)

Status: **Proposed** · Sprint: content foundation follow-up · Not implemented yet.

This document reserves the design for the learning CMS so the current data
foundation (`prisma/schema.prisma`) does not need reshaping later. **No content
tables are created in this sprint** — creating them now would bloat the initial
migration without value.

## 1. Goals

- Author training content (programs → days → courses → lessons → blocks).
- Store quizzes and track per-employee progress and attempts.
- Keep media (especially video) out of PostgreSQL and out of GitHub.
- Enforce authoring permissions server-side (ADMIN / editor).

## 2. Future entities

| Entity | Purpose | Key fields (draft) |
| --- | --- | --- |
| `TrainingProgram` | Top-level program (e.g. adaptation) | id, slug, title, status, order |
| `TrainingDay` | A day within a program | id, programId → Program, title, order, estimatedMinutes |
| `Course` | Broader track | id, slug, title, accessLevel, status, order |
| `Lesson` | A lesson | id, slug, title, dayId?/courseId?, durationMinutes, xpReward, isRequired, accessLevel, order, status |
| `LessonBlock` | Ordered content block | id, lessonId → Lesson, type (VIDEO/TEXT/IMAGE/INFO_CARD/CHECKLIST/EQUIPMENT_CARD/GROUP_CLASS_CARD/QUIZ/SUMMARY), order, data (Json) |
| `MediaAsset` | Media metadata (not bytes) | id, kind (VIDEO/IMAGE/DOCUMENT), storageKey, url, mimeType, sizeBytes, status, createdBy |
| `Quiz` | A quiz | id, lessonId?/dayId?, title, passingScore, isAttestation |
| `QuizQuestion` | A question | id, quizId → Quiz, prompt, order |
| `QuizOption` | An answer option | id, questionId → QuizQuestion, text, isCorrect, order |
| `LessonProgress` | Per-employee lesson state | id, userId → User, lessonId, state, completedAt |
| `QuizAttempt` | Per-employee attempt | id, userId → User, quizId, score, passed, createdAt |
| `XPTransaction` | Personal XP ledger (see domain/xp) | id, userId → User, amount, reason, createdAt |

Relations use real foreign keys. Enums (`LessonBlockType`, `MediaKind`,
`MediaStatus`, `LessonProgressState`) are added alongside the tables.

> `LessonBlock.data` is typed per `type` in the application layer (discriminated
> union) while stored as `Json`, so new block types don't require migrations.

## 3. Media storage & security

**Video and large files are never stored in PostgreSQL and never committed to
GitHub.** The DB stores only metadata + a storage key/URL.

- **Object storage:** S3-compatible (Cloudflare R2 preferred — no egress fees).
  Env: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
  (server-only). Public delivery via a CDN/`MEDIA_PUBLIC_BASE_URL`.
- **Upload:** browser → server requests a **signed upload URL** (short TTL) →
  browser PUTs directly to storage. The app server never proxies bytes.
- **Validation:** MIME allow-list per `kind`, hard **file-size limits**
  (e.g. video ≤ 500 MB, image ≤ 10 MB), extension/content-type match.
- **Object keys:** unique, non-guessable (`{kind}/{uuid}.{ext}`); never derived
  from user input.
- **`MediaStatus`:** `PENDING → READY → FAILED`. An asset is usable only when
  `READY` (set after an upload-completion callback / verification).
- **Orphans:** a scheduled job deletes `PENDING` assets with no completed upload
  after a TTL, and storage objects with no `MediaAsset` row.
- **Authorization:** only `ADMIN`/editor may request upload URLs or attach media;
  enforced by `requireAdmin()` (see `src/lib/server/authz.ts`).
- **Git hygiene:** `*.mp4`, `*.mov`, `/uploads`, media caches are git-ignored.

## 4. Migration strategy

Content tables ship in their **own** migration in the CMS sprint
(`add_content_platform`), keeping `init_application_data_foundation` focused on
identity/onboarding. No breaking changes to existing tables are anticipated —
content links to `User` via additive relations only.
