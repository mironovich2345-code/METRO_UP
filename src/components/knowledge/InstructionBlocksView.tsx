import { AlertTriangle, Info, ListChecks, ListOrdered } from "lucide-react";
import { RichText } from "@/components/academy/lesson/RichText";
import type { InstructionBlockDTO } from "@/lib/api/knowledge-types";

/**
 * Renders structured instruction blocks (TEXT/STEPS/CHECKLIST/INFO_CARD/WARNING).
 * Shared by the admin preview and the employee reader. CHECKLIST is a reference
 * list only — it has NO interactive completion state (Daily Plan is separate).
 */
export function InstructionBlocksView({ blocks }: { blocks: InstructionBlockDTO[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((b) => {
        switch (b.type) {
          case "TEXT":
            return <RichText key={b.id} doc={b.doc} />;
          case "STEPS":
            return (
              <div key={b.id} className="rounded-2xl border border-border bg-card p-4">
                {b.title && <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><ListOrdered className="size-4 text-brand" />{b.title}</p>}
                <ol className="space-y-2">
                  {b.steps.map((s, i) => (
                    <li key={s.id} className="flex gap-3 text-[15px]">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/12 text-xs font-bold text-brand">{i + 1}</span>
                      <span className="pt-0.5">{s.text}</span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          case "CHECKLIST":
            return (
              <div key={b.id} className="rounded-2xl border border-border bg-card p-4">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><ListChecks className="size-4 text-brand" />{b.title || "Чек-лист"}</p>
                <ul className="space-y-1.5">
                  {b.items.map((it) => (
                    <li key={it.id} className="flex gap-2.5 text-[15px]">
                      <span className="mt-1 size-4 shrink-0 rounded-md border border-border" aria-hidden />
                      <span>{it.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          case "INFO_CARD":
            return (
              <div key={b.id} className="rounded-2xl border border-brand/25 bg-brand/8 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Info className="size-4 text-brand" />{b.title || "Важная информация"}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-foreground">{b.text}</p>
              </div>
            );
          case "WARNING":
            return (
              <div key={b.id} className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-600 dark:text-amber-400"><AlertTriangle className="size-4" />{b.title || "Предупреждение"}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-foreground">{b.text}</p>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
