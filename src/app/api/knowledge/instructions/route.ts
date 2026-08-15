import { requireEmployeeProfile } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getEmployeeInstructions } from "@/lib/server/knowledge-public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireEmployeeProfile();
    return jsonOk(await getEmployeeInstructions());
  } catch (e) {
    return handleError(e);
  }
}
