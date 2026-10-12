import "server-only";
import { prisma } from "../db";
import { screenSurface, type ScreenKey } from "@/lib/telemetry/screens";
import { maybeCleanupTelemetry } from "./cleanup";

/**
 * Sprint: LIVE QA QA-07 — append ONE committed screen visit for the REAL
 * session user. The surface comes from the screen registry, never from the
 * client.
 */
export async function recordPageView(userId: string, screen: ScreenKey): Promise<void> {
  await prisma.pageViewEvent.create({ data: { userId, surface: screenSurface(screen), screenKey: screen }, select: { id: true } });
  maybeCleanupTelemetry();
}
