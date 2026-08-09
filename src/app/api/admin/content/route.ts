import { prisma } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/content — CMS dashboard summary (counts + program list). */
export async function GET() {
  try {
    await requireAdmin();
    const [programs, lessonsByStatus, mediaCount, draftPrograms] = await Promise.all([
      prisma.trainingProgram.findMany({
        orderBy: { order: "asc" },
        include: { _count: { select: { courses: true, days: true } } },
      }),
      prisma.lesson.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.mediaAsset.count(),
      prisma.trainingProgram.count({ where: { status: "DRAFT" } }),
    ]);
    const counts = { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0 } as Record<string, number>;
    for (const row of lessonsByStatus) counts[row.status] = row._count._all;
    return jsonOk({
      programs: programs.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        order: p.order,
        courses: p._count.courses,
        days: p._count.days,
      })),
      totals: {
        programs: programs.length,
        draftPrograms,
        lessonsDraft: counts.DRAFT,
        lessonsPublished: counts.PUBLISHED,
        lessonsArchived: counts.ARCHIVED,
        media: mediaCount,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
