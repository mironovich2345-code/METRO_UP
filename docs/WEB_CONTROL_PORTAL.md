# Web Control portal (feat/web-control-portal)

A unified desktop-first web panel that reuses the existing `/admin` (CMS) and
`/spm` (rating) pages — no new CMS, no new SPM workflow, no duplicated APIs.
A user opens a normal browser, signs in with Telegram, and works with the system
without launching the Telegram Mini App.

## Entry & auth

- **`/control`** — dashboard (title "METRO UP Control", subtitle "Управление
  обучением и результатами команды").
- **`/control/login`** — unified web sign-in for ADMIN + SPM via the existing
  Telegram Login Widget (`TelegramLoginWidget` → `/api/auth/telegram-web`). The
  server verifies the widget hash, opens the existing HttpOnly session, and reads
  the real role from PostgreSQL. `/spm/login` now routes into the same portal.
- Unauthenticated `/control` → redirect to `/control/login`. EMPLOYEE /
  CLUB_MANAGER → "У вас нет доступа к панели управления."
- No passwords, no email/password credentials, no client-side role escalation.

## Role matrix (reuses existing guards)

| Section | Route | Guard | ADMIN | SPM |
|---|---|---|---|---|
| Dashboard | `/control` | `canAccessSpm` | ✅ | ✅ |
| Обучение | `/admin/content` | `requireAdmin` / `canAccessAdmin` | ✅ | ❌ |
| Медиа | `/admin/media` | `requireAdmin` | ✅ | ❌ |
| Продажи | `/spm/sales` | `requireSPMAccess` / `canAccessSpm` | ✅ | ✅ |
| Тайный покупатель | `/spm/mystery` | `requireSPMAccess` | ✅ | ✅ |
| Рейтинг | `/spm/rating` | `requireSPMAccess` | ✅ | ✅ |

No second permission system was introduced. Sections a role can't access are
simply not shown (no disabled items).

## Unified shell

`ControlShell` is the single desktop sidebar (brand, role-based nav, user + role,
"Выйти"). `/control`, `/admin/*`, and `/spm/*` all render inside it, so moving
between learning and SPM never feels like two products. `/admin` and `/spm` are
NOT wrapped in the mobile `.app-shell` (already excluded in `AppShellFrame`).
Logout uses the existing `POST /api/auth/logout`, then → `/control/login`.

## Lesson creation flow

`/admin/content` → **Создать урок** → pick Program → Day → Course → title →
opens the editor at `/admin/content/lessons/[id]`. No UUID hunting; if a
Program/Day/Course is missing, the flow points back to the inline creators on the
content page. The lesson editor shows an informational structure checklist
(Видео / Текст / Главное / Тест — готово/отсутствует) that does not change
publish rules.

## Telegram Mini App unchanged

Profile → "Панель управления" (/admin) and "Панель СПМ" (/spm) still work. The
primary **desktop** entry is now `/control/login`.

## Manual steps after deploy (Railway + BotFather)

The desktop Telegram Login Widget needs two things:

1. **Railway → Variables**: set **`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`** to your
   bot's username **without `@`** (public, safe to expose). Redeploy. Until it is
   set, `/control/login` shows a "web-вход не настроен" notice; an SPM/ADMIN can
   still establish a session by opening the Mini App in Telegram once, then visit
   `/control`.
2. **BotFather → your bot → Bot Settings → Domain** (`/setdomain`): set the exact
   deploy domain of the app (e.g. `metro-up.up.railway.app` or your custom
   domain). The Login Widget only renders/authorizes on the domain registered
   here. `TELEGRAM_BOT_TOKEN` (already set, server-only) is used to verify the
   widget hash — no new secret is required.

Grant a role in the DB (no self-registration):
`UPDATE users SET role='ADMIN'|'SPM' WHERE "telegramUsername"='...';` (the user
must have signed in via Telegram at least once so a `users` row exists).

## Desktop UI stabilization (fix/control-desktop-layout + stabilization)

- **Root cause of narrow layout**: `/control` was missing from
  `AppShellFrame.FULL_WIDTH_PREFIXES`, so it was wrapped in the mobile
  `.app-shell` (480px). Fixed — the whole control area is desktop full-width;
  `ControlShell` uses a fixed 256px sidebar + `flex-1 min-w-0` main capped at
  `max-w-[1440px]`.
- **Learning CMS (`/admin/content`)** reworked for clarity: the primary scenario
  is the **Создать урок** flow (program → day → course → title → editor);
  programs render as a readable **day → course → lesson** hierarchy; secondary
  structure operations (create program/day/course, attach course to a day,
  archive) are hidden behind a per-program **«Структура»** toggle + a separated
  "Управление структурой" section. Inputs/buttons unified via `admin/ui`.
- **Filter toolbar** (`SpmToolbar`) is the single reusable desktop filter used by
  Sales / Mystery / Rating — consistent labels, control heights (`fieldCls`),
  fixed widths, gaps and baseline. Filter logic unchanged.
- **Modals** (mystery editor, create-lesson) get `max-h-[90vh] overflow-y-auto`
  so they never overflow short viewports.

### Media decision

`/admin/media` is a static info page; there is **no** media-list API, and a real
reusable library needs a new read endpoint **plus** usage cross-referencing
across lesson-block JSON — a read model beyond a stabilization sprint's scope and
prohibited by "no new business logic / API". Per the sprint's fallback, **Media
was removed from the primary Control nav and dashboard**; uploads continue inside
the lesson editor's VIDEO/IMAGE blocks (existing R2 pipeline, unchanged). The
`/admin/media` route still exists (direct URL) as an informational page. A
reusable media library remains a future functional sprint.

## What did NOT change

rating formula, achievement logic, Academy employee UX, R2 storage backend,
Telegram Mini App auth, XP logic, onboarding, Prisma role enum, existing APIs,
data models. No new fake data.
