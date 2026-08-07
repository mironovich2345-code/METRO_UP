import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError } from "./authz";
import { zodFieldErrors } from "./schemas";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(
  status: number,
  code: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: code, ...extra }, { status });
}

/**
 * Convert thrown errors into safe responses. Never leaks stack traces, Prisma
 * internals, secrets, or Telegram initData.
 */
export function handleError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return jsonError(error.status, error.code);
  }
  if (error instanceof z.ZodError) {
    return jsonError(400, "validation_error", { fields: zodFieldErrors(error) });
  }
  return jsonError(500, "internal_error");
}
