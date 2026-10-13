import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCompanyForEdit } from "@/lib/admin/entity-edit";
import { getCompanyBackups, type CompanyBackupDTO } from "@/lib/admin/company-backups";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/authorization-errors";
import { ManageSubsectionShell } from "../../_components/ManageSubsectionShell";
import { CreateCompanyForm } from "../../_components/CreateCompanyForm";
import { CompanyBackups } from "../../_components/CompanyBackups";
import { DeleteEntityForm } from "../../_components/DeleteEntityForm";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/sign-in");
  }

  let record;
  let isAdmin = false;
  let backups: CompanyBackupDTO[] = [];
  try {
    record = await getCompanyForEdit(id);
    // Only Admin may delete a startup or restore an earlier version of it.
    isAdmin = (await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS")).role === "FALAK_ADMIN";
    if (record && isAdmin) backups = await getCompanyBackups(id);
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthenticatedError) {
      redirect("/account");
    }
    throw error;
  }
  if (!record) {
    notFound();
  }

  return (
    <ManageSubsectionShell titleKey="editCompanyTitle">
      <div className="flex flex-col gap-8">
        {/* Keyed by the saved details, so a restore shows them in the form at once. */}
        <CreateCompanyForm key={JSON.stringify(record)} company={record} />
        {isAdmin ? <CompanyBackups backups={backups} /> : null}
        {isAdmin ? <DeleteEntityForm kind="company" id={record.id} nameEn={record.nameEn} /> : null}
      </div>
    </ManageSubsectionShell>
  );
}
