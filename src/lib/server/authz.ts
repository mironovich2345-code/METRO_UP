import "server-only";
import type { AppRole } from "@prisma/client";
import { getCurrentUser, type CurrentUser } from "./session";

/**
 * Server-side authorization helpers. Authorization is ALWAYS enforced on the
 * server — never trust the frontend. UI for privileged roles does not exist yet,
 * but the server model is ready.
 */

export class AuthError extends Error {
  status: number;
  code: string;
  /** Optional structured, client-safe details (e.g. publish validation errors). */
  details?: unknown;
  constructor(status: number, code: string, message?: string, details?: unknown) {
    super(message ?? code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401, "unauthorized", "Authentication required");
  return user;
}

export async function requireRole(...roles: AppRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AuthError(403, "forbidden", "Insufficient permissions");
  }
  return user;
}

export async function requireEmployeeProfile(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.employeeProfile) {
    throw new AuthError(409, "onboarding_required", "Employee profile required");
  }
  return user;
}

export const requireClubManager = () => requireRole("CLUB_MANAGER", "ADMIN");
export const requireSPM = () => requireRole("SPM", "ADMIN");
export const requireAdmin = () => requireRole("ADMIN");
