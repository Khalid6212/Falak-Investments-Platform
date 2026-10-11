import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getPositionExposure } from "@/lib/admin/investor-exposure";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/authorization-errors";
import { ManageSubsectionShell } from "../../_components/ManageSubsectionShell";
import { InvestorExposureForm } from "../../_components/InvestorExposureForm";

export default async function InvestorExposurePage({ params }: { params: Promise<{ positionId: string }> }) {
  const { positionId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/sign-in");
  }

  let data;
  try {
    data = await getPositionExposure(positionId);
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthenticatedError) {
      redirect("/account");
    }
    throw error;
  }
  if (!data) {
    notFound();
  }

  return (
    <ManageSubsectionShell titleKey="exposureTitle">
      <InvestorExposureForm key={data.startups.map((s) => s.exposure?.id ?? s.companyId).join(",") + data.exposureScope} data={data} />
    </ManageSubsectionShell>
  );
}
