# Control desktop layout — v1 audit

Root cause of the narrow desktop layout: `/control` was NOT in
`AppShellFrame.FULL_WIDTH_PREFIXES`, so it was wrapped in the mobile `.app-shell`
(`max-width: 480px; margin-inline: auto`). The whole `ControlShell` (sidebar +
main) was crammed into a 480px centered column → mobile-stretched look with a huge
empty right half. `/admin/*` and `/spm/*` were already excluded, so they were
full-width but capped at `max-w-6xl` (1152px).

## Fix

- `AppShellFrame`: added `/control` to the full-width prefixes → the control area
  bypasses `.app-shell` entirely. Employee Mini App routes are unchanged.
- `ControlShell`: sidebar `w-64` (256px) `shrink-0 grow-0 basis-64` (stable, no
  grow/shrink); main is `flex-1 min-w-0` with inner `mx-auto w-full
  max-w-[1440px]` + responsive padding (`px-5 sm:px-6 lg:px-8`).
- `ControlDashboard`: `xl:[grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]`
  → 1 col mobile, 2 col ≥640px, 3(+) col on wide desktop; cards never below ~300px.

## Live screenshot matrix (verify on the deployed URL)

Screenshots require an authenticated ADMIN/SPM session on the running deployment,
so they are captured against the Railway URL, not in this build-only environment.
Verify at: `/control` (1366×768, 1440×900, 1920×1080), `/admin/content/lessons/[id]`
(1440×900), `/spm/sales`, `/spm/mystery`, `/spm/rating` (1440×900), and the
430×900 mobile fallback (sidebar hidden, content full-width, no page h-scroll).

Acceptance (1440): sidebar ~256px, main fills the rest, dashboard cards ≥300px,
3 across where space allows, no absurd word-wrapping, no huge empty right half,
`/admin` and `/spm` tables use the full working width, Mini App still 480px.
