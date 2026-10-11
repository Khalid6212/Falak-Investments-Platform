import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCompanyReportData } from "@/lib/company/queries";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/authorization-errors";
import { CompanyProfileView, type ProfileTab } from "../../_components/CompanyProfileView";

const TABS: ProfileTab[] = ["overview", "reports", "dashboard"];

export default async function CompanyProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string | string[]; period?: string | string[] }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/sign-in");
  }

  let data;
  try {
    data = await getCompanyReportData(slug);
  } catch (error) {
    // Same as the report page: a startup the viewer can't see looks like
    // one that doesn't exist.
    if (error instanceof ForbiddenError) notFound();
    if (error instanceof UnauthenticatedError) redirect("/sign-in");
    throw error;
  }
  if (!data) {
    notFound();
  }

  const tabRaw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const initialTab = TABS.find((t) => t === tabRaw) ?? "overview";
  const requestedPeriod = Array.isArray(sp.period) ? sp.period[0] : sp.period;
  const initialPeriodKey =
    requestedPeriod && data.company.periods[requestedPeriod] ? requestedPeriod : (data.periods[data.periods.length - 1]?.key ?? "");

  return <CompanyProfileView key={data.company.id} data={data} initialTab={initialTab} initialPeriodKey={initialPeriodKey} />;
}
