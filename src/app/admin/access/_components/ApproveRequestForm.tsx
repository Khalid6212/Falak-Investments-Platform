"use client";

import { useState } from "react";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { RefreshingForm } from "@/components/forms/RefreshingForm";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { approveAccessRequestAction } from "../actions";
import type { AccessRequestedRole } from "@/generated/prisma/client";
import { ALL_DEPARTMENTS_VALUE } from "@/lib/auth/department-choice";

type Grant = "FALAK_MANAGEMENT" | "FALAK_OPERATIONS" | "INVESTOR";

// The requested role is only a suggestion, never auto-granted -- the
// admin can change it before submitting.
function defaultGrantFor(requestedRole: AccessRequestedRole): Grant {
  if (requestedRole === "MANAGEMENT") return "FALAK_MANAGEMENT";
  if (requestedRole === "INVESTMENT_PROFESSIONAL") return "FALAK_OPERATIONS";
  return "INVESTOR";
}

interface ApproveRequestFormProps {
  requestId: string;
  requestedRole: AccessRequestedRole;
  organizationName: string | null;
}

export function ApproveRequestForm({ requestId, requestedRole, organizationName }: ApproveRequestFormProps) {
  const { t } = useLanguage();
  const [grant, setGrant] = useState<Grant>(defaultGrantFor(requestedRole));

  return (
    <RefreshingForm action={approveAccessRequestAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="flex flex-col gap-1">
        <label htmlFor={`grant-${requestId}`} className="text-xs font-medium text-muted-foreground">
          {t.access.approveGrantLabel}
        </label>
        <Select id={`grant-${requestId}`} name="grant" value={grant} onChange={(e) => setGrant(e.target.value as Grant)}>
          <option value="FALAK_MANAGEMENT">{t.signUp.roleOptions.MANAGEMENT}</option>
          <option value="FALAK_OPERATIONS">{t.signUp.roleOptions.INVESTMENT_PROFESSIONAL}</option>
          <option value="INVESTOR">{t.signUp.roleOptions.INVESTOR}</option>
        </Select>
      </div>

      {grant !== "INVESTOR" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`dept-${requestId}`} className="text-xs font-medium text-muted-foreground">
            {t.admin.manage.departmentLabel}
          </label>
          <Select id={`dept-${requestId}`} name="department" required defaultValue="">
            <option value="" disabled>
              {t.admin.manage.selectPlaceholder}
            </option>
            <option value="VentureBuilder">{t.departments.VentureBuilder}</option>
            <option value="InvestmentDepartment">{t.departments.InvestmentDepartment}</option>
            {grant === "FALAK_MANAGEMENT" ? <option value={ALL_DEPARTMENTS_VALUE}>{t.admin.manage.allDepartmentsOption}</option> : null}
          </Select>
        </div>
      ) : null}

      {grant === "INVESTOR" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`org-${requestId}`} className="text-xs font-medium text-muted-foreground">
            {t.access.approveOrgLabel}
          </label>
          <Input id={`org-${requestId}`} name="organizationName" type="text" defaultValue={organizationName ?? ""} required />
        </div>
      ) : null}

      <Button type="submit" size="xs">
        {t.access.approveAction}
      </Button>
    </RefreshingForm>
  );
}
