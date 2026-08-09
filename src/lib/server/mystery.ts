import "server-only";
import { prisma } from "./db";
import { ruMonthYear } from "@/lib/labels";
import type { MysterySummaryDTO } from "@/lib/api/home-types";

/**
 * Mystery shopper read model. The employee only ever sees PUBLISHED results.
 * No published result → honest empty state (no fake score/club/comment). Write
 * UI is out of scope this sprint; authoring will be SPM-only in the LK sprint.
 */
export async function getMysterySummary(userId: string): Promise<MysterySummaryDTO> {
  const result = await prisma.mysteryShopperResult.findFirst({
    where: { employeeUserId: userId, status: "PUBLISHED" },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
  });
  if (!result) return { hasData: false };
  return {
    hasData: true,
    periodLabel: ruMonthYear(result.periodMonth, result.periodYear),
    score: result.score,
    comment: result.comment,
  };
}
