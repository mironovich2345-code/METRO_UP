import type { EmployeePosition } from "@prisma/client";
import { canAccessScripts } from "@/lib/knowledge-access";
import type { ResponseFilter } from "./openai";

/**
 * Retrieval access control (pure — no server-only import, so it is unit
 * testable). Mirrors the app's knowledge gate: Scripts are for sales-facing
 * positions only ("SALES" scope); Academy + Instructions are for everyone
 * ("ALL"). Filtering happens on the SERVER during retrieval — never on the
 * client — so Metric can never surface content the UI would hide.
 */
export type PositionScope = "ALL" | "SALES";
export type MetricSourceType = "ACADEMY" | "SCRIPT" | "INSTRUCTION";

/** The access scope stored on each knowledge chunk. */
export function scopeForSource(sourceType: MetricSourceType): PositionScope {
  return sourceType === "SCRIPT" ? "SALES" : "ALL";
}

/** Whether an employee position may see a given scope. */
export function positionAllows(position: EmployeePosition | null | undefined, scope: PositionScope): boolean {
  return scope === "ALL" ? true : canAccessScripts(position);
}

/**
 * The vector-store attribute filter for a given position: ALL is always visible;
 * SALES (scripts) only for CLIENT_MANAGER / NIGHT_MANAGER. This is applied at
 * retrieval time so restricted content never reaches the model or the sources.
 */
export function retrievalFilter(position: EmployeePosition | null | undefined): ResponseFilter {
  if (canAccessScripts(position)) {
    return {
      type: "or",
      filters: [
        { type: "eq", key: "positionScope", value: "ALL" },
        { type: "eq", key: "positionScope", value: "SALES" },
      ],
    };
  }
  return { type: "eq", key: "positionScope", value: "ALL" };
}
