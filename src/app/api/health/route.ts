import { NextResponse } from "next/server";

/** Liveness probe used by Railway's healthcheck. Always executed at runtime. */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok", service: "METRO_UP" });
}
