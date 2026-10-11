import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminPortfolioData } from "@/lib/admin/queries";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/authorization-errors";
import { ManageSubsectionShell } from "../_components/ManageSubsectionShell";
import { CreateCompanyForm } from "../_components/CreateCompanyForm";
import { ArchivableList } from "../_components/ArchivableList";
import { NewEntityWithList } from "../_components/NewEntityWithList";
import { CompanyImportPanel } from "../_components/CompanyImportPanel";
import { archiveCompanyAction } from "../../actions";

export default async function NewCompanyPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/sign-in");
  }

  let data;
  try {
    data = await getAdminPortfolioData();
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthenticatedError) {
      redirect("/account");
    }
    throw error;
  }

  return (
    <ManageSubsectionShell titleKey="createCompanyTitle">
      <CompanyImportPanel />
      <NewEntityWithList listTitleKey="companiesListTitle">
        <CreateCompanyForm />
        <ArchivableList
          items={data.companies}
          action={archiveCompanyAction}
          fieldName="companyId"
          editBasePath="/admin/manage/edit-company"
        />
      </NewEntityWithList>
    </ManageSubsectionShell>
  );
}
