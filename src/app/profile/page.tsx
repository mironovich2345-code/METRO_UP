"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Building2, CalendarDays, Camera, Check, ChevronRight, Clock, HelpCircle, MapPin, Briefcase, LayoutDashboard, Pencil, Trophy, User, UserCog, type LucideIcon } from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { BOTTOM_NAV_CLEARANCE_CLASS } from "@/lib/bottom-nav-clearance";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Avatar } from "@/components/ui/avatar";
import { AvatarCropSheet } from "@/components/profile/AvatarCropSheet";
import { ProfileEditSheet } from "@/components/profile/ProfileEditSheet";
import { EmploymentStartSheet } from "@/components/profile/EmploymentStartSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeSegmented } from "@/components/ui/theme-switcher";
import { SectionHeader } from "@/components/ui/section-header";
import { useApp } from "@/providers/app-provider";
import { useAppUser } from "@/providers/AppUserProvider";
import { getCityById, getClubById, getPositionById } from "@/content";
import { isSharedControlRole } from "@/lib/roles";
import { RANKS } from "@/lib/ranks";
import type { AccessStatus, CareerLevel } from "@/lib/profile";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn, formatNumber } from "@/lib/utils";
import { fetchProfileManagementRoles } from "@/lib/api/home-client";
import { fetchSelfProfile, updateSelfEmploymentStart } from "@/lib/api/client";
import { useQuery, QUERY_POLICY } from "@/lib/client/query-cache";
import { cacheKeys } from "@/lib/client/cache-keys";
import { useRootScreenEntrance } from "@/lib/client/root-screen-entrance";
import type { ProfileManagementRoleDTO } from "@/lib/api/home-types";
import { canShowAskQuestionEntry } from "@/lib/client/ask-question-core";
import { loadStoredContext } from "@/lib/home-context-storage";
import { getOwnerKey } from "@/lib/client/owner";
import { NOT_SET_LABEL, canSelfEditProfile, describeEmployment, splitDisplayName } from "@/lib/profile-edit";

const CAREER_RANK_INDEX: Record<CareerLevel, number> = {
  NEWCOMER: 0,
  MANAGER: 1,
  TOP_MANAGER: 2,
  LEADER: 3,
  MANAGER_PRO: 4,
};

const ACCESS_LABELS: Record<AccessStatus, string> = {
  LIMITED: "Базовый доступ",
  PENDING_APPROVAL: "Ожидает подтверждения",
  FULL: "Полный доступ",
  SUSPENDED: "Доступ приостановлен",
};

export default function ProfileScreen() {
  const { profile, isOnboarded, hydrated } = useApp();
  // Role comes ONLY from the server-backed session user — never from localStorage.
  const { user: serverUser, refresh: refreshAppUser, saveProfile } = useAppUser();
  const [cropOpen, setCropOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [employmentOpen, setEmploymentOpen] = useState(false);
  const entranceInitial = useRootScreenEntrance();
  // Sprint: LIVE QA QA-02 — during a MANAGER/CLUB_MANAGER persona preview
  // this screen renders the synthetic preview persona (/api/auth/me), so it
  // offers no editing at all: neither the name nor the photo. The server
  // refuses those writes anyway (middleware + requireNoActiveViewAs); a
  // CITY_MANAGER self-preview is the real actor and stays editable.
  const canEdit = canSelfEditProfile(serverUser?.viewContext);
  // Sprint: REMEDIATION R3, F-06 — server-derived (hasSystemAccessForUser,
  // the SAME primitive /admin's own layout/routes gate on), not re-derived
  // from the legacy role alone: a grant-only PROJECT_ADMIN (no legacy
  // AppRole=ADMIN) now sees this entry too, matching their real /admin
  // authority exactly. ALWAYS the real actor's own value (never
  // persona-substituted, per meDTO's own doc comment) — View As cannot
  // widen or hide it.
  const isAdmin = serverUser?.hasSystemAccess ?? false;
  // Sprint: LIVE QA QA-06.1/06.2 — the shared PROJECT_ADMIN + SPM workspace
  // (Тайный покупатель, Продажи, Рейтинг сотрудников at /spm). The SAME
  // predicate the /spm server guard (hasSharedControlAccess) and the Control
  // navigation use, fed with the server-derived hasSystemAccess — so a
  // grant-only PROJECT_ADMIN sees it, CLUB_MANAGER / CITY_MANAGER / MANAGER
  // never do, and an ended/suspended/pending grant never counts.
  const canSharedControl = serverUser ? isSharedControlRole(serverUser.role, isAdmin) : false;
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !isOnboarded) router.replace("/welcome");
  }, [hydrated, isOnboarded, router]);

  // Sprint: manual-test-round-3, section 4 — "Роль в Metro UP" / "Доступные
  // клубы", server-scoped (never derived from EmployeeProfile.clubId).
  // Empty for a plain MANAGER — no empty block rendered then.
  const { data: managementRolesData } = useQuery(
    hydrated && isOnboarded ? cacheKeys.profileManagementRoles() : null,
    () => fetchProfileManagementRoles().then((r) => r.roles),
    QUERY_POLICY.MEDIUM,
  );
  const managementRoles: ProfileManagementRoleDTO[] = managementRolesData ?? [];

  // Sprint: LIVE QA QA-02 — the real employment start date (GET /api/profile;
  // never User.createdAt). Separate from AppUser so the auth bootstrap stays
  // a single query.
  const { data: selfProfile, error: selfProfileError, mutate: setSelfProfile } = useQuery(
    hydrated && isOnboarded ? cacheKeys.selfProfile() : null,
    fetchSelfProfile,
    QUERY_POLICY.MEDIUM,
  );

  if (!hydrated || !profile) {
    return <div className="min-h-[100dvh]" />;
  }

  const city = getCityById(profile.cityId);
  const club = getClubById(profile.clubId);
  const position = getPositionById(profile.positionId);
  const levelIndex = CAREER_RANK_INDEX[profile.careerLevel];
  const currentRank = RANKS[levelIndex];
  const name = splitDisplayName(profile.displayName);
  const identityPlace = [club?.name, city?.name].filter(Boolean).join(" · ");

  // Loading and "nothing recorded" are different states: a pulse while the
  // request is in flight, "Не указано" only once it has answered with nothing.
  const employment = describeEmployment(selfProfile?.employmentStartedAt ?? null);
  const employmentValue = (resolved: string) =>
    selfProfile ? resolved : selfProfileError ? "Ошибка загрузки" : <ValuePending />;

  const personalRows: InfoRowData[] = [
    { icon: User, label: "Имя", value: name.firstName || NOT_SET_LABEL },
    { icon: User, label: "Фамилия", value: name.lastName || NOT_SET_LABEL },
  ];
  const workRows: InfoRowData[] = [
    { icon: Briefcase, label: "Должность", value: position?.title ?? "—" },
    { icon: Building2, label: "Клуб", value: club ? `MetroFitness ${club.name}` : "—" },
    { icon: MapPin, label: "Город", value: city?.name ?? "—" },
    // QA-04 — the employee's own start date is the one editable work field
    // (Должность/Клуб/Город stay read-only). "Указать" when none is recorded
    // yet; Стаж below is always derived, never edited.
    {
      icon: CalendarDays,
      label: "Дата начала работы",
      value: employmentValue(canEdit && !selfProfile?.employmentStartedAt ? "Указать" : employment.startDate),
      onClick: canEdit && selfProfile ? () => setEmploymentOpen(true) : undefined,
      stacked: true,
    },
    { icon: Clock, label: "Стаж", value: employmentValue(employment.tenure) },
  ];

  return (
    <div className={`relative min-h-[100dvh] ${BOTTOM_NAV_CLEARANCE_CLASS}`}>
      <AppHeader title="Профиль" showThemeSwitcher={false} />

      <motion.main
        variants={staggerStack}
        initial={entranceInitial}
        animate="show"
        className="flex flex-col gap-6 px-5"
      >
        {/* Identity */}
        <motion.div variants={cardIn} className="flex min-w-0 flex-col items-center pt-2 text-center">
          {/* METRO UP ROUND 1, Milestone 1 — tap avatar to change photo.
              src is the custom uploaded avatar ONLY (serverUser.avatarUrl) —
              deliberately never telegramUser.photoUrl; no custom avatar
              means initials, by product rule, not a Telegram-photo fallback.
              QA-02: not tappable during a persona preview (see canEdit). */}
          {canEdit ? (
            <button
              type="button"
              onClick={() => setCropOpen(true)}
              className="relative rounded-full"
              aria-label="Изменить фото профиля"
            >
              <Avatar
                name={profile.displayName}
                src={serverUser?.avatarUrl ?? undefined}
                size={92}
                ring
              />
              <span className="absolute bottom-0 right-0 flex size-7 items-center justify-center rounded-full border-2 border-background bg-brand">
                <Camera className="size-3.5 text-brand-foreground" />
              </span>
            </button>
          ) : (
            <Avatar name={profile.displayName} src={serverUser?.avatarUrl ?? undefined} size={92} ring />
          )}
          <h1 className="mt-4 max-w-full text-2xl font-extrabold tracking-tight text-foreground [overflow-wrap:anywhere]">
            {profile.displayName}
          </h1>
          {position && <p className="mt-1 max-w-full text-sm font-medium text-muted-foreground [overflow-wrap:anywhere]">{position.title}</p>}
          {identityPlace && <p className="max-w-full text-sm text-muted-foreground [overflow-wrap:anywhere]">{identityPlace}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Badge variant="brand" size="md">
              {currentRank.title}
            </Badge>
            <Badge variant="neutral" size="md">
              {ACCESS_LABELS[profile.accessStatus]}
            </Badge>
          </div>
          {canEdit ? (
            <Button variant="secondary" size="md" className="mt-4" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" /> Редактировать профиль
            </Button>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Редактирование недоступно в режиме просмотра</p>
          )}
        </motion.div>

        {/* QA-02 — personal data: the employee's own, editable via the sheet. */}
        <motion.div variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader title="Мои данные" />
          <InfoCard rows={personalRows} />
        </motion.div>

        {/* QA-02 — work data: company-controlled, never editable here. */}
        <motion.div variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader title="Работа" />
          <InfoCard rows={workRows} />
          <p className="px-1 text-xs text-muted-foreground">Рабочие данные изменяются руководителем</p>
        </motion.div>

        {/* METRO UP ROUND 1, Milestone 2B/2B.1 — "Задать вопрос" entry point.
            Visible ONLY when the CURRENT EFFECTIVE Mini App context (Home's
            own context-switcher concept, home-context-storage.ts — never a
            legacy UI-only role flag) is one of PERSONAL/CLUB_MANAGER/
            CITY_MANAGER, and accessStatus isn't PENDING_APPROVAL/SUSPENDED
            (canShowAskQuestionEntry, an ALLOWLIST so a future unsupported
            context is hidden automatically). The entry being visible is
            never itself authority — canSendQuestionAs re-validates the
            actual sender context server-side regardless. Deliberately a
            single compact row (not a full descriptive card like Admin/SPM
            below) so it stays non-intrusive per the task's own instruction. */}
        {canShowAskQuestionEntry(loadStoredContext(getOwnerKey())?.type ?? null, profile.accessStatus) && (
          <motion.div variants={cardIn}>
            <GlassCard variant="solid" pad="none" animateIn={false}>
              <button
                type="button"
                onClick={() => router.push("/questions/ask")}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/12">
                  <HelpCircle className="size-4.5 text-brand" />
                </span>
                <span className="flex-1 text-[15px] font-semibold text-foreground">Задать вопрос</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </GlassCard>
          </motion.div>
        )}

        {/* Sprint: manual-test-round-3, section 4 — "Роль в Metro UP" /
            "Доступные клубы". One card per management role the real actor
            holds (today only ever CITY_MANAGER populates this); a plain
            MANAGER gets managementRoles:[] and no card renders at all. */}
        {managementRoles.map((role) => (
          <motion.div key={role.type} variants={cardIn} className="flex flex-col gap-3">
            <SectionHeader title="Роль в Metro UP" />
            <GlassCard variant="solid" pad="md" animateIn={false}>
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/12">
                  <UserCog className="size-4.5 text-brand" />
                </span>
                <span className="text-[15px] font-semibold text-foreground">{role.label}</span>
              </div>
              {role.clubs.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Доступные клубы</p>
                  <ul className="flex flex-col gap-1.5">
                    {role.clubs.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 text-sm text-foreground">
                        <span className="size-1.5 shrink-0 rounded-full bg-brand" />
                        <span className="truncate">{c.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </GlassCard>
          </motion.div>
        ))}

        {/* Admin CMS entry — ONLY for server role ADMIN (never EMPLOYEE/SPM/CLUB_MANAGER). */}
        {isAdmin && (
          <motion.div variants={cardIn}>
            <GlassCard variant="solid" pad="md" animateIn={false}>
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                  <LayoutDashboard className="size-5 text-brand" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-foreground">Панель управления</p>
                  <p className="text-sm text-muted-foreground">
                    Управление обучением и материалами
                  </p>
                </div>
              </div>
              <Button
                block
                variant="secondary"
                className="mt-3"
                onClick={() => router.push("/admin")}
              >
                Открыть
              </Button>
            </GlassCard>
          </motion.div>
        )}

        {/* Shared Control entry (/spm) — PROJECT_ADMIN or SPM; never CLUB_MANAGER/CITY_MANAGER/MANAGER. */}
        {canSharedControl && (
          <motion.div variants={cardIn}>
            <GlassCard variant="solid" pad="md" animateIn={false}>
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                  <Trophy className="size-5 text-brand" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-foreground">Контроль и результаты</p>
                  <p className="text-sm text-muted-foreground">
                    Продажи, тайный покупатель и рейтинг
                  </p>
                </div>
              </div>
              <Button
                block
                variant="secondary"
                className="mt-3"
                onClick={() => router.push("/spm")}
              >
                Открыть
              </Button>
            </GlassCard>
          </motion.div>
        )}

        {/* Career ladder */}
        <motion.div variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader title="Карьерная лестница" />
          <GlassCard variant="solid" pad="md" animateIn={false}>
            <ol className="flex flex-col">
              {RANKS.map((rank, i) => {
                const reached = i <= levelIndex;
                const current = i === levelIndex;
                return (
                  <li key={rank.id} className="flex items-center gap-3.5">
                    <div className="flex flex-col items-center self-stretch">
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                          current
                            ? "bg-brand text-brand-foreground"
                            : reached
                              ? "bg-foreground text-background"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {reached ? (
                          <Check className="size-4" strokeWidth={3} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      {i < RANKS.length - 1 && (
                        <span
                          className={cn(
                            "my-1 w-0.5 flex-1 rounded-full",
                            reached ? "bg-foreground/30" : "bg-border",
                          )}
                        />
                      )}
                    </div>
                    <div
                      className={cn(
                        "flex-1 pb-4",
                        i === RANKS.length - 1 && "pb-0",
                      )}
                    >
                      <p
                        className={cn(
                          "text-[15px] font-bold",
                          reached ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {rank.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatNumber(rank.minXp)} XP · {rank.tagline}
                      </p>
                    </div>
                    {current && (
                      <Badge variant="brand" size="sm">
                        Сейчас
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ol>
          </GlassCard>
        </motion.div>

        {/* Appearance */}
        <motion.div variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader title="Тема оформления" />
          <ThemeSegmented />
        </motion.div>
      </motion.main>

      <BottomNavigation />

      <AvatarCropSheet
        open={cropOpen && canEdit}
        onClose={() => setCropOpen(false)}
        onSaved={() => {
          // Pull the fresh AppUserDTO (now carrying the new avatarUrl) —
          // same refresh() AppShellFrame's ViewAsBanner already calls after
          // its own session-affecting action, not a new mechanism.
          void refreshAppUser();
        }}
      />

      {/* QA-02 — saveProfile applies the server-CONFIRMED user, so this
          header, Home's greeting/avatar and every AppUser reader update
          together; an ordinary save, never a context switch. */}
      {/* QA-04 — the server returns the confirmed SelfProfileDTO; writing it
          straight into the cache updates the date AND the derived tenure at
          once, with no refetch and no reload. */}
      <EmploymentStartSheet
        open={employmentOpen && canEdit}
        startedAtIso={selfProfile?.employmentStartedAt ?? null}
        onClose={() => setEmploymentOpen(false)}
        onSave={async (startedOn) => {
          const updated = await updateSelfEmploymentStart(startedOn);
          await setSelfProfile(updated, { revalidate: false });
        }}
      />

      <ProfileEditSheet
        open={editOpen && canEdit}
        displayName={profile.displayName}
        onClose={() => setEditOpen(false)}
        onSave={(parts) => saveProfile({ firstName: parts.firstName, lastName: parts.lastName })}
      />
    </div>
  );
}

interface InfoRowData {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  /** Makes the row a button with a trailing chevron (QA-04: start date). */
  onClick?: () => void;
  /** Label above the value instead of beside it — a long value ("15 сентября
   * 2024" + chevron) would otherwise crush the label at 320px. */
  stacked?: boolean;
}

/** The label/value list style the Profile already used for its work info,
 * shared by "Мои данные" and "Работа". Long values truncate inside their own
 * cell (never widen the page). */
function InfoCard({ rows }: { rows: InfoRowData[] }) {
  return (
    <GlassCard variant="solid" pad="sm" animateIn={false}>
      {rows.map((row, i) => {
        const Icon = row.icon;
        const rowClass = cn("flex w-full items-center gap-3 px-2 py-3 text-left", i < rows.length - 1 && "border-b border-border");
        const content = (
          <>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
              <Icon className="size-4.5 text-muted-foreground" />
            </div>
            {row.stacked ? (
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <span className="truncate text-[15px] font-semibold text-foreground">{row.value}</span>
              </span>
            ) : (
              <>
                <span className="min-w-0 flex-1 text-sm text-muted-foreground">{row.label}</span>
                <span className="max-w-[55%] truncate text-right text-[15px] font-semibold text-foreground">{row.value}</span>
              </>
            )}
            {row.onClick && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          </>
        );
        return row.onClick ? (
          <button key={row.label} type="button" onClick={row.onClick} className={cn(rowClass, "rounded-xl transition-colors active:bg-foreground/5")}>
            {content}
          </button>
        ) : (
          <div key={row.label} className={rowClass}>
            {content}
          </div>
        );
      })}
    </GlassCard>
  );
}

/** In-flight placeholder for a value still being loaded — never shown as
 * "Не указано", which would claim the answer is already known. */
function ValuePending() {
  return <span aria-label="Загрузка" className="inline-block h-4 w-16 animate-pulse rounded bg-muted align-middle" />;
}
