import type { EmployeePosition } from "@prisma/client";

/**
 * Pure access rules for the knowledge base (no server-only import, so it is
 * usable in both server and unit-test contexts). Scripts are for sales-facing
 * positions; instructions are for every employee.
 */
export const SCRIPT_POSITIONS: EmployeePosition[] = ["CLIENT_MANAGER", "NIGHT_MANAGER"];

export function canAccessScripts(position: EmployeePosition | null | undefined): boolean {
  return position != null && SCRIPT_POSITIONS.includes(position);
}
