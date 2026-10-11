import { buildCompanyImportTemplate } from "@/lib/admin/company-import";
import { requireFalakRole } from "@/lib/auth/authorization";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/authorization-errors";

// The Excel template for importing startups. Staff only (it holds no data,
// but it's part of a staff-only tool).
export async function GET(): Promise<Response> {
  try {
    await requireFalakRole("FALAK_OPERATIONS");
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new Response("Sign in required", { status: 401 });
    if (error instanceof ForbiddenError) return new Response("Not allowed", { status: 403 });
    throw error;
  }
  const file = await buildCompanyImportTemplate();
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="falak-startups-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
