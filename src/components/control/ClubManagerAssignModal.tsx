"use client";

import { useEffect, useState } from "react";
import { UserCog } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import { rolesApi } from "@/lib/api/roles-client";
import type { CabinetTeamMemberDTO } from "@/lib/api/cabinet-client";
import { Field, TextArea } from "@/components/admin/ui";
import { Modal } from "@/components/control/Modal";
import { cn } from "@/lib/utils";

/**
 * Sprint: role-cabinets, step 5, sections 9-10 — assign a club's
 * CLUB_MANAGER. The employee picker is deliberately backed by
 * cabinetApi.clubManagerTeam(clubId) (step 4's own scoped read model, which
 * the CITY_MANAGER already has club.read authority for) — NOT
 * usersAdminApi/control/users, which is requireSystemAccess()-only and
 * would 403 for a CITY_MANAGER. This is what keeps the picker correctly
 * limited to real employees of THIS club: no phone, no unrelated PII, just
 * displayName + position (exactly what CabinetTeamMemberDTO exposes).
 *
 * Submission reuses rolesApi.create() unchanged (src/app/api/control/roles) —
 * no second role-management backend. A collision with an already-active
 * CLUB_MANAGER grant surfaces the server's own 409 message rather than
 * silently retrying or creating a duplicate.
 */
export function ClubManagerAssignModal({
  clubId,
  clubName,
  onClose,
  onAssigned,
}: {
  clubId: string;
  clubName: string | null;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [members, setMembers] = useState<CabinetTeamMemberDTO[] | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<CabinetTeamMemberDTO | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    cabinetApi
      .clubManagerTeam(clubId)
      .then((d) => {
        setMembers(d.members);
        setLoadStatus("ready");
      })
      .catch(() => setLoadStatus("error"));
  }, [clubId]);

  const submit = async () => {
    if (!selected) {
      setErr("Выберите сотрудника.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await rolesApi.create({ userId: selected.userId, role: "CLUB_MANAGER", scopeType: "CLUB", clubId, reason: reason || undefined });
      onAssigned();
    } catch (e) {
      setErr(
        e instanceof ApiError && e.code === "assignment_already_active"
          ? "У клуба уже есть активный управляющий."
          : "Не удалось назначить управляющего.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} size="md">
      <div className="p-6">
        <h2 className="text-lg font-bold">Назначить управляющего</h2>
        <p className="mt-1 text-sm text-muted-foreground">Клуб «{clubName ?? "—"}»</p>

        <div className="mt-4 space-y-4">
          <Field label="Сотрудник">
            {loadStatus === "loading" && <p className="text-sm text-muted-foreground">Загрузка сотрудников…</p>}
            {loadStatus === "error" && <p className="text-sm text-red-500">Не удалось загрузить сотрудников клуба.</p>}
            {loadStatus === "ready" && members && members.length === 0 && (
              <p className="text-sm text-muted-foreground">В клубе пока нет сотрудников.</p>
            )}
            {loadStatus === "ready" && members && members.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-border">
                {members.map((m) => (
                  <button
                    key={m.userId}
                    onClick={() => setSelected(m)}
                    className={cn(
                      "flex w-full items-center justify-between border-b border-border px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-muted",
                      selected?.userId === m.userId && "bg-brand/10",
                    )}
                  >
                    <span>{m.displayName}</span>
                    <span className="text-xs text-muted-foreground">{m.position ?? "—"}</span>
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field label="Комментарий" hint="Необязательно — попадёт в журнал аудита.">
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>

          {err && <p className="text-sm text-red-500">{err}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold">
              Отмена
            </button>
            <button
              onClick={submit}
              disabled={busy || !selected}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
            >
              <UserCog className="size-4" /> {busy ? "…" : "Назначить"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
