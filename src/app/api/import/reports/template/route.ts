import { buildReportImportTemplate } from "@/lib/admin/report-import";
import { loadImportCompanies, loadImportTemplate } from "@/lib/admin/report-import-context";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/authorization-errors";

// The Excel file for importing past reports on one template
// (?templateId=...): its metric columns plus the caller's startups to pick from.
export async function GET(request: Request): Promise<Response> {
  let departments;
  try {
    ({ departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new Response("Sign in required", { status: 401 });
    if (error instanceof ForbiddenError) return new Response("Not allowed", { status: 403 });
    throw error;
  }
  const templateId = new URL(request.url).searchParams.get("templateId");
  const template = templateId ? await loadImportTemplate(templateId) : null;
  if (!template) return new Response("Template not found", { status: 404 });

  const companies = await loadImportCompanies(departments);
  const file = await buildReportImportTemplate(template, companies.map((c) => c.nameEn));
  const safeName = template.nameEn.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "template";
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="falak-reports-import-${safeName}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
