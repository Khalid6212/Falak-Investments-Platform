import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminPortfolioData } from "@/lib/admin/queries";
import { getArchivedReportingCycles, getReportingRequestGroups } from "@/lib/admin/reporting-request-groups";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/authorization-errors";
import { ManageSubsectionShell } from "../_components/ManageSubsectionShell";
import { CreateReportingCycleForm } from "../_components/CreateReportingCycleForm";
import { ReportImportPanel } from "../_components/ReportImportPanel";

export default async function NewReportingCyclePage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/sign-in");
  }

  let data;
  let groups;
  let archived;
  let canDelete = false;
  try {
    [data, groups, archived] = await Promise.all([getAdminPortfolioData(), getReportingRequestGroups(), getArchivedReportingCycles()]);
    canDelete = (await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS")).role === "FALAK_ADMIN";
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthenticatedError) {
      redirect("/account");
    }
    throw error;
  }

  return (
    <ManageSubsectionShell titleKey="createCycleTitle">
      <div className="flex flex-col gap-6">
        <ReportImportPanel templates={data.templates} />
        <CreateReportingCycleForm companies={data.companies} templates={data.templates} groups={groups} archived={archived} canDelete={canDelete} />
      </div>
    </ManageSubsectionShell>
  );
}
