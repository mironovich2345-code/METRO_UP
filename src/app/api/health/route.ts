import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness + database connectivity. Returns 503 when the DB
 * is unreachable. Never exposes host, credentials, or error details.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      service: "METRO_UP",
      database: "connected",
    });
  } catch {
    return NextResponse.json(
      { status: "error", service: "METRO_UP", database: "disconnected" },
      { status: 503 },
    );
  }
}
