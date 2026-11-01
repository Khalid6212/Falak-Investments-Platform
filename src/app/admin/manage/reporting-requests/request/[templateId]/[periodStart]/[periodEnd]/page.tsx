import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getReportingRequestDetail } from "@/lib/admin/reporting-request-detail";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/authorization-errors";
import { ManageSubsectionShell } from "../../../../../_components/ManageSubsectionShell";
import { RequestDetailClient } from "../../../../_components/RequestDetailClient";

export default async function ReportingRequestPage({
  params,
}: {
  params: Promise<{ templateId: string; periodStart: string; periodEnd: string }>;
}) {
  const { templateId, periodStart, periodEnd } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/sign-in");
  }

  let detail;
  let canDelete = false;
  try {
    detail = await getReportingRequestDetail(templateId, periodStart, periodEnd);
    canDelete = (await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS")).role === "FALAK_ADMIN";
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthenticatedError) {
      redirect("/account");
    }
    throw error;
  }
  // Also where archiving the request's last startup lands.
  if (!detail) {
    redirect("/admin/manage/new-reporting-cycle");
  }

  return (
    <ManageSubsectionShell titleKey="requestDetailTitle">
      <RequestDetailClient detail={detail} canDelete={canDelete} />
    </ManageSubsectionShell>
  );
}
