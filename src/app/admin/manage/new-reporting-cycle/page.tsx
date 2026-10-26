import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminPortfolioData } from "@/lib/admin/queries";
import { getReportingRequestGroups } from "@/lib/admin/reporting-request-groups";
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
  try {
    [data, groups] = await Promise.all([getAdminPortfolioData(), getReportingRequestGroups()]);
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
        <CreateReportingCycleForm companies={data.companies} templates={data.templates} groups={groups} />
      </div>
    </ManageSubsectionShell>
  );
}
