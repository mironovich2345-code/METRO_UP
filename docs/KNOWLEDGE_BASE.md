# Knowledge Base + User Management

Production modules added on top of the existing platform (no parallel role / auth /
CMS system). Foundation for a future Metric AI knowledge source — but **no** AI,
embeddings, RAG or content import in this sprint.

## Modules

1. **Scripts** — работы сценарии разговоров (`ScriptCategory` + `Script`).
2. **Work Instructions** — рабочие регламенты (`WorkInstructionCategory` + `WorkInstruction`).
3. **User Management** — ADMIN назначает роль / должность / клуб (reuses `AppRole` +
   `EmployeeProfile`, adds `UserAuditLog`).

## Data model (additive)

- `ScriptCategory(title, slug, description?, order, isActive, ts)`.
- `Script(categoryId→cascade, title, slug unique, description?, content Json, status
  ContentStatus, order, createdByUserId, updatedByUserId?, publishedAt?, ts)`.
  `content` = `{ whenToUse, goal, keyQuestions[], script: RichDoc, doNotSay[], nextStep }`.
- `WorkInstructionCategory` — same shape as script category.
- `WorkInstruction(..., summary?, blocks Json, status, ...)`. `blocks[]` =
  `TEXT{doc:RichDoc} | STEPS{title?,steps[]} | CHECKLIST{title?,items[]} | INFO_CARD{title?,text} | WARNING{title?,text}`.
- `UserAuditLog(actorUserId, targetUserId, action, before Json?, after Json?, createdAt)`.

**Reuse:** `ContentStatus` enum, the structured `richDocSchema` / `RichText` renderer,
`ContentAuditLog` + `writeAudit` (for scripts/instructions), `slugify`, the block/rich
authoring model. No raw HTML is ever stored or rendered.

Migration `20260815120000_knowledge_base_and_user_admin`: **only** `CREATE TABLE`,
`CREATE INDEX`, `ADD FOREIGN KEY`. Zero `DROP` / destructive `ALTER`. No existing table
touched.

## Security

- All CMS + user writes: `requireAdmin` (ADMIN only). SPM / CLUB_MANAGER / EMPLOYEE
  cannot reach scripts, instructions or user APIs.
- Employee knowledge reads: `requireEmployeeProfile`; scripts additionally gated to
  `CLIENT_MANAGER` / `NIGHT_MANAGER` (`canAccessScripts`). Instructions: all employees.
- Employee API returns **PUBLISHED only** (`status: "PUBLISHED"`), never DRAFT/ARCHIVED.
- User management: actor is derived from the session (`requireAdmin().id`), never the
  body. Guards: self-demotion of ADMIN rejected; last remaining ADMIN cannot be demoted;
  CLUB_MANAGER needs a concrete club; club/city validated against the model. Every change
  writes `UserAuditLog` with before/after (ids + role/club/position/status only — no secrets).
- A PUBLISHED script/instruction is read-only until returned to DRAFT (no half-edited
  published content reaches employees — same model as Academy lessons).
- Instruction CHECKLIST is **reference-only**: no completion state, never a DailyTask.

## Navigation

- Control ADMIN sidebar/cards: Главная · Обучение · **Скрипты** · **Инструкции** ·
  **Сотрудники** · План дня · Команда · Продажи · Тайный покупатель · Рейтинг.
- SPM: Главная · Продажи · Тайный · Рейтинг (unchanged). CLUB_MANAGER: Главная · План
  дня · Команда (no Scripts/Instructions CMS).
- Employee: single **«База знаний»** entry on Home → `/knowledge` hub → Скрипты /
  Инструкции. Bottom nav (4 tabs) is NOT expanded.

## Manual verification on Railway (integration tests are skips)

1. Additive migration applies cleanly (`db:migrate:deploy`); no data loss.
2. ADMIN: create category → script → fill sections → Preview → Publish; employee (sales
   position) sees it; DRAFT/ARCHIVED never appear for employees.
3. ADMIN: create instruction with TEXT+STEPS+CHECKLIST+WARNING → Publish; reads well on
   a phone; checklist shows no checkboxes-with-state and creates no DailyTask.
4. Non-sales position (ADMINISTRATOR) gets 403 on `/api/knowledge/scripts`; still sees
   instructions.
5. FLOW C: assign an existing user CLUB_MANAGER + club → they get /control plan/team for
   that club only; cannot see CMS/Sales/Mystery/Rating.
6. Self-demotion of the acting ADMIN → blocked; demoting the only ADMIN → blocked.
7. Role/club change appears in `user_audit_logs` (before/after).
8. SPM / CLUB_MANAGER hitting `/api/control/scripts|instructions|users` → 403.
