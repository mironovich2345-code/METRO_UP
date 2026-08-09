# Metro UP — Content CMS & Lesson Player (runbook)

Vertical slice: ADMIN authors a lesson in the web CMS (`/admin`) → uploads video
→ adds cards → builds a quiz → sets XP → previews → publishes. EMPLOYEE opens the
lesson in Telegram → watches → passes the quiz → lesson completes → XP is saved
in PostgreSQL → the next lesson unlocks.

## Architecture

- **Data**: Prisma models `TrainingProgram / TrainingDay / Course / Lesson /
  LessonBlock / MediaAsset / Quiz / QuizQuestion / QuizOption / LessonProgress /
  QuizAttempt / XPTransaction / ContentAuditLog`. Migration
  `20260809120000_content_learning_foundation` (additive only; existing
  User/Profile/City/Club untouched).
- **Storage**: S3-compatible abstraction in `src/lib/storage/` (interface →
  `s3-provider` SigV4, implemented with Node crypto + fetch, **no SDK
  dependency**). Binary never touches Postgres; the DB stores metadata only.
- **XP**: balance is always `SUM(XPTransaction.amount)` — never a stored scalar.
  Idempotent via `@@unique([userId, reason, sourceType, sourceId])`. XP affects
  personal progress only (not rating/career).
- **Gating**: server-resolved. Published lessons of a program form one ordered
  sequence (day → course → lesson); a lesson unlocks only when every prior
  REQUIRED lesson is COMPLETED (also enforces day N after day N-1).

## Trade-offs (MVP)

- **Edit published**: a PUBLISHED lesson is **read-only** for structural edits;
  the admin unpublishes (→ DRAFT), edits, then re-publishes. This guarantees
  employees never see a half-edited published lesson (simpler than full
  draft/published versioning; can be upgraded later).
- **Video delivery**: served from the public delivery domain
  (`STORAGE_PUBLIC_BASE_URL`). Bucket **listing** stays closed; upload uses a
  short-lived (15 min) signed PUT to a random key. The interface already allows
  switching to private signed GET playback URLs without touching business logic.
- **Admin auth transport**: the CMS reuses the existing HttpOnly session +
  `requireAdmin()` (server-enforced on every page and API). Obtaining an
  ADMIN-role session in a desktop browser is an operational step (see below); no
  new auth system was introduced.

## Railway env variables (add in Railway → Variables)

Existing: `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`.
New (object storage, server-only — never `NEXT_PUBLIC_`):

```
STORAGE_ENDPOINT           # https://<accountid>.r2.cloudflarestorage.com
STORAGE_REGION             # auto (R2) or e.g. us-east-1
STORAGE_BUCKET             # metro-media
STORAGE_ACCESS_KEY_ID      # R2 access key id
STORAGE_SECRET_ACCESS_KEY  # R2 secret access key
STORAGE_PUBLIC_BASE_URL    # https://media.yourdomain.com (delivery domain)
```

`preDeployCommand = npm run db:migrate:deploy` already applies new migrations on
deploy. Content is **not** seeded automatically.

## Step-by-step: connect object storage (Cloudflare R2)

1. Cloudflare dashboard → R2 → **Create bucket** (e.g. `metro-media`).
2. R2 → **Manage API Tokens** → create a token with Object Read & Write for the
   bucket. Copy the Access Key ID + Secret.
3. The S3 endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
4. Public delivery: attach a **custom domain** (or enable the r2.dev subdomain)
   to the bucket → that URL is `STORAGE_PUBLIC_BASE_URL`. Keep bucket **listing
   disabled** (default). Configure CORS to allow `PUT` from your app origin.
5. Put all six `STORAGE_*` values into Railway → Variables → redeploy.

## Step-by-step: grant AppRole.ADMIN to a user

The user must have signed in once via Telegram (so a `users` row exists).

```sql
-- Railway → Postgres → Query (or: railway connect / psql)
UPDATE users SET role = 'ADMIN' WHERE "telegramUsername" = 'your_username';
-- or by displayName / telegramId if you know it.
```

Then open the app once via Telegram to (re)issue the session cookie, and visit
`/admin` in the same browser context. `requireAdmin()` reads the role from the DB.

## Step-by-step: create the first lesson + upload video

1. Go to `/admin/content` → **Создать программу** (e.g. "Адаптация Metro UP").
2. In the program: add **День 1**, add a **Курс**, then add an **Урок**
   ("Как устроено обучение в Metro UP").
3. Open the lesson → set **XP** (e.g. 50), duration, description → Save.
4. **Добавить блок → Видео** → **Загрузить видео** (MP4/WebM ≤ 500 MB). Wait for
   READY. Add 4 **Инфо-карточки**, then an **Итоги** block.
5. **Добавить тест** → questions/options, passing %, XP → Save.
6. **Предпросмотр** (opens the real player in preview mode — no XP/progress).
7. **Опубликовать**. If validation fails, fix the listed errors and retry.
8. Employee: Академия → the lesson appears under "Активные уроки"; Home →
   "Продолжить обучение" points at the next available lesson.

## Manual content smoke-seed (optional, not automatic)

`tsx prisma/seed-content.ts` creates a DRAFT "Как устроено обучение в Metro UP"
program/day/course/lesson (info-cards + a draft quiz, **no video**) for a quick
smoke test. It requires an existing ADMIN user and is idempotent. Video is always
uploaded by a human through the CMS — never seeded.
