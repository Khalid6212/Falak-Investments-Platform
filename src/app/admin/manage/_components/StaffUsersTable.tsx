"use client";

import { useForm } from "@/components/forms/useForm";
import { RefreshingForm } from "@/components/forms/RefreshingForm";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useListView, byText } from "@/components/lists/useListView";
import { ALL_DEPARTMENTS_VALUE } from "@/lib/auth/department-choice";
import type { StaffUserRow } from "@/lib/admin/staff";
import {
  adminSetStaffDepartmentAction,
  adminSetUserPasswordAction,
  revokeStaffRoleAction,
} from "../../actions";
import { initialActionState, FormMessage } from "./shared";

function StaffUserRowItem({ row }: { row: StaffUserRow }) {
  const { t } = useLanguage();
  const dept = useForm(adminSetStaffDepartmentAction, initialActionState, { resetOnSuccess: false });
  const pw = useForm(adminSetUserPasswordAction, initialActionState);

  return (
    <tr className="border-b border-border/60">
      <td className="py-2 pe-4 align-top text-sm">{row.email}</td>
      <td className="py-2 pe-4 align-top text-sm">{t.staffRoleNames[row.role]}</td>
      <td className="py-2 pe-4 align-top">
        <form {...dept.formProps} className="flex flex-col gap-1">
          <input type="hidden" name="userId" value={row.id} />
          <div className="flex items-center gap-2">
            <Select name="department" defaultValue={row.allDepartments ? ALL_DEPARTMENTS_VALUE : (row.department ?? "")} className="w-40">
              <option value="" disabled>{t.admin.manage.selectPlaceholder}</option>
              <option value="VentureBuilder">{t.departments.VentureBuilder}</option>
              <option value="InvestmentDepartment">{t.departments.InvestmentDepartment}</option>
              {row.role === "FALAK_MANAGEMENT" ? <option value={ALL_DEPARTMENTS_VALUE}>{t.admin.manage.allDepartmentsOption}</option> : null}
            </Select>
            <Button type="submit" size="xs" disabled={dept.isPending}>
              {t.admin.manage.submitLabel}
            </Button>
          </div>
          {dept.errorFor("department")}
          <FormMessage state={dept.state} />
        </form>
      </td>
      <td className="py-2 pe-4 align-top text-sm">
        {row.hasPassword ? t.admin.manage.yesLabel : t.admin.manage.noLabel}
      </td>
      <td className="py-2 pe-4 align-top">
        <form {...pw.formProps} className="flex flex-col gap-1">
          <input type="hidden" name="userId" value={row.id} />
          <div className="flex items-center gap-2">
            <Input type="password" name="newPassword" placeholder={t.admin.manage.newPasswordLabel} className="w-36" />
            <Button type="submit" size="xs" disabled={pw.isPending}>
              {t.admin.manage.setPasswordAction}
            </Button>
          </div>
          {pw.errorFor("newPassword")}
          <FormMessage state={pw.state} />
        </form>
      </td>
      <td className="py-2 align-top">
        <RefreshingForm action={revokeStaffRoleAction}>
          <input type="hidden" name="userId" value={row.id} />
          <input type="hidden" name="role" value={row.role} />
          <Button type="submit" variant="outline" size="xs">
            {t.admin.manage.revokeAction}
          </Button>
        </RefreshingForm>
      </td>
    </tr>
  );
}

export function StaffUsersTable({ rows }: { rows: StaffUserRow[] }) {
  const { t } = useLanguage();
  const { visible, controls, empty } = useListView(rows, {
    id: "staff-users",
    searchText: (r) => `${r.email} ${t.staffRoleNames[r.role]} ${r.allDepartments ? t.admin.manage.allDepartmentsOption : r.department ? t.departments[r.department] : ""}`,
    sorts: [
      byText("emailAsc", t.lists.emailAsc, (r) => r.email),
      byText("roleAsc", t.lists.roleAsc, (r) => t.staffRoleNames[r.role]),
    ],
  });

  return (
    <div className="flex flex-col gap-2">
      {controls}
      {empty}
      <table className="w-full text-start">
        <caption className="mb-2 text-start text-xs text-muted-foreground">
          {t.admin.manage.staffListCaption}
        </caption>
        <thead>
          <tr className="border-b border-border text-xs font-medium text-muted-foreground">
            <th className="py-2 pe-4 text-start">{t.admin.manage.emailLabel}</th>
            <th className="py-2 pe-4 text-start">{t.admin.manage.roleLabel}</th>
            <th className="py-2 pe-4 text-start">{t.admin.manage.departmentLabel}</th>
            <th className="py-2 pe-4 text-start">{t.admin.manage.hasPasswordLabel}</th>
            <th className="py-2 pe-4 text-start">{t.admin.manage.newPasswordLabel}</th>
            <th className="py-2 text-start" />
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <StaffUserRowItem key={`${row.id}-${row.role}`} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
