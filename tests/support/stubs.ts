/**
 * Shared, minimal stand-ins for the real I/O dependencies intercepted by
 * mock-loader.mjs (`@/lib/db`'s `db`, `@/lib/auth/current-user`'s
 * `getCurrentUser`, and `@/lib/email/send-email`'s `sendSignInEmail`).
 * Every test file sets the matching `globalThis.__TEST_*_STUB__` before
 * dynamically importing the real production module under test, so each
 * test gets a fresh, independent stub -- nothing here ever touches a real
 * database or sends a real email.
 */

export interface StubUser {
  id: string;
  email: string;
}

export function setCurrentUser(user: StubUser | null): void {
  (globalThis as Record<string, unknown>).__TEST_GET_CURRENT_USER_STUB__ = async () => user;
}

// Department lookup made by requireFalakRoleWithDepartmentScope for any
// non-Admin Falak caller. Domain stubs that don't model users get this
// default; fixtures don't model departments either, so the value only
// needs to be non-null (a null department scopes to zero rows).
export const DEFAULT_STUB_DEPARTMENT = "InvestmentDepartment";

export function setDbStub(stub: unknown): void {
  const s = stub as Record<string, unknown> | null;
  if (s && typeof s === "object" && !("user" in s)) {
    s.user = { findUnique: async () => ({ department: DEFAULT_STUB_DEPARTMENT }) };
  }
  // Lookups by slug use findFirst (to also exclude deleted records); domain
  // stubs that only model findUnique serve both.
  if (s && typeof s === "object") {
    for (const model of Object.values(s)) {
      if (model && typeof model === "object") {
        const m = model as Record<string, unknown>;
        if (typeof m.findUnique === "function" && !("findFirst" in m)) m.findFirst = m.findUnique;
      }
    }
  }
  (globalThis as Record<string, unknown>).__TEST_DB_STUB__ = stub;
}

export interface SentEmail {
  to: string;
  verifyUrl: string;
}

/**
 * Installs a spy in place of sendSignInEmail and returns the array it
 * records calls into -- push-only, read by tests via .length/[0], never
 * mutated by the stub itself beyond appending.
 */
export function setSendEmailSpy(): SentEmail[] {
  const calls: SentEmail[] = [];
  (globalThis as Record<string, unknown>).__TEST_SEND_EMAIL_STUB__ = async (to: string, verifyUrl: string) => {
    calls.push({ to, verifyUrl });
  };
  return calls;
}

export interface SentPasswordResetEmail {
  to: string;
  resetUrl: string;
}

/** Installs a spy in place of sendPasswordResetEmail -- same shape as setSendEmailSpy above. */
export function setSendPasswordResetEmailSpy(): SentPasswordResetEmail[] {
  const calls: SentPasswordResetEmail[] = [];
  (globalThis as Record<string, unknown>).__TEST_SEND_PASSWORD_RESET_EMAIL_STUB__ = async (to: string, resetUrl: string) => {
    calls.push({ to, resetUrl });
  };
  return calls;
}

/**
 * Installs a spy in place of sendAccessApprovedEmail -- same shape as
 * setSendEmailSpy above, kept separate since it's a different real
 * function with a different (single-argument) signature.
 */
export function setSendAccessApprovedEmailSpy(): string[] {
  const calls: string[] = [];
  (globalThis as Record<string, unknown>).__TEST_SEND_ACCESS_APPROVED_EMAIL_STUB__ = async (to: string) => {
    calls.push(to);
  };
  return calls;
}

export interface SentReminderEmail {
  to: string;
  companyName: string;
  periodLabel: string;
  deadline: string;
  formUrl: string;
}

/** Shared by both reminder kinds -- same signature, different real function. */
function installReminderSpy(stubKey: string): SentReminderEmail[] {
  const calls: SentReminderEmail[] = [];
  (globalThis as Record<string, unknown>)[stubKey] = async (
    to: string,
    companyName: string,
    periodLabel: string,
    deadline: string,
    formUrl: string
  ) => {
    calls.push({ to, companyName, periodLabel, deadline, formUrl });
  };
  return calls;
}

export function setSendDeadlineReminderEmailSpy(): SentReminderEmail[] {
  return installReminderSpy("__TEST_SEND_DEADLINE_REMINDER_EMAIL_STUB__");
}

export function setSendOverdueReminderEmailSpy(): SentReminderEmail[] {
  return installReminderSpy("__TEST_SEND_OVERDUE_REMINDER_EMAIL_STUB__");
}

export interface SentPublishedEmail {
  to: string;
  companyName: string;
  periodLabel: string;
  reportUrl: string;
}

export function setSendReportPublishedEmailSpy(): SentPublishedEmail[] {
  const calls: SentPublishedEmail[] = [];
  (globalThis as Record<string, unknown>).__TEST_SEND_REPORT_PUBLISHED_EMAIL_STUB__ = async (
    to: string,
    companyName: string,
    periodLabel: string,
    reportUrl: string
  ) => {
    calls.push({ to, companyName, periodLabel, reportUrl });
  };
  return calls;
}

export const REAL_USER: StubUser = { id: "user_1", email: "a@b.com" };

interface MembershipFixture {
  userId: string;
  companyId?: string;
  investorId?: string;
  role: string;
  revoked?: boolean;
  archived?: boolean;
}

interface FalakRoleFixture {
  role: string;
  revoked?: boolean;
}

/**
 * Backs requireCurrentUser/requireFalakRole/requireCompanyMembership/
 * requireInvestorMembership (src/lib/auth/authorization.ts) exactly as
 * that real module queries them: userId/companyId/investorId equality,
 * `role: { in: [...] }`, `revokedAt: null`, and the related resource's
 * `archivedAt: null` via a relation filter.
 */
export function makeAuthorizationDbStub(options: {
  companyMembership?: MembershipFixture | null;
  investorMembership?: MembershipFixture | null;
  falakRoles?: FalakRoleFixture[];
  throwError?: Error;
}) {
  return {
    companyMembership: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (options.throwError) throw options.throwError;
        const m = options.companyMembership;
        if (!m) return null;
        if (where.userId !== m.userId) return null;
        if (where.companyId !== m.companyId) return null;
        if (m.revoked) return null;
        if (m.archived) return null;
        const roleFilter = where.role as { in: string[] };
        if (!roleFilter.in.includes(m.role)) return null;
        return { role: m.role };
      },
    },
    investorMembership: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (options.throwError) throw options.throwError;
        const m = options.investorMembership;
        if (!m) return null;
        if (where.userId !== m.userId) return null;
        if (where.investorId !== m.investorId) return null;
        if (m.revoked) return null;
        if (m.archived) return null;
        const roleFilter = where.role as { in: string[] };
        if (!roleFilter.in.includes(m.role)) return null;
        return { role: m.role };
      },
    },
    userRoleAssignment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        if (options.throwError) throw options.throwError;
        const roleFilter = where.role as { in: string[] };
        return (options.falakRoles ?? [])
          .filter((r) => !r.revoked && roleFilter.in.includes(r.role))
          .map((r) => ({ role: r.role }));
      },
    },
  };
}

export interface SubmissionFixture {
  id: string;
  cycleCompanyId: string;
  templateId: string;
  status: string;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  currentDeadline: Date;
  companyArchived?: boolean;
}

export interface MetricDefinitionFixture {
  id: string;
  templateId: string;
  isActive: boolean;
  required: boolean;
  key?: string;
  labelEn?: string;
  labelAr?: string;
  dataType?: string;
  sortOrder?: number;
}

export interface SubmissionMetricValueFixture {
  submissionId: string;
  metricDefinitionId: string;
  isNa: boolean;
  numericValue: number | null;
  textValue: string | null;
}

/**
 * Backs getCurrentSubmissionForCompanyMember/submitCompanySubmission
 * (src/lib/reporting/submissions.ts) exactly as that real module queries
 * them. `submission.status` is genuinely mutated by the conditional
 * `updateMany` (only when its WHERE predicate matches, mirroring real
 * Prisma semantics -- including the exact-status pin), and `$transaction`
 * rolls back that mutation if its callback throws, simulating Prisma's
 * own interactive-transaction rollback for the one test that needs it.
 */
export function makeReportingDbStub(options: {
  membership: MembershipFixture | null;
  submission: SubmissionFixture | null;
  metricDefinitions?: MetricDefinitionFixture[];
  submissionMetricValues?: SubmissionMetricValueFixture[];
  eventCount?: number;
  throwOnEventCreate?: Error;
}) {
  const state: {
    submission: SubmissionFixture | null;
    eventCount: number;
    lastAppliedPrevStatus?: string;
    lastEventData?: Record<string, unknown>;
    auditEvents: Record<string, unknown>[];
  } = {
    submission: options.submission ? { ...options.submission } : null,
    eventCount: options.eventCount ?? 0,
    auditEvents: [],
  };
  const metricDefinitions = options.metricDefinitions ?? [];
  const submissionMetricValues = options.submissionMetricValues ?? [];

  const stub = {
    companyMembership: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const m = options.membership;
        if (!m) return null;
        if (where.userId !== m.userId) return null;
        if (where.companyId !== m.companyId) return null;
        if (m.revoked) return null;
        if (m.archived) return null;
        const roleFilter = where.role as { in: string[] };
        if (!roleFilter.in.includes(m.role)) return null;
        return { role: m.role };
      },
    },
    userRoleAssignment: { findMany: async () => [] },
    metricDefinition: {
      findMany: async ({ where }: { where: { templateId?: string; isActive?: boolean; id?: { in: string[] } } }) => {
        let rows = metricDefinitions;
        if (where.templateId !== undefined) rows = rows.filter((d) => d.templateId === where.templateId);
        if (where.isActive !== undefined) rows = rows.filter((d) => d.isActive === where.isActive);
        if (where.id) rows = rows.filter((d) => where.id!.in.includes(d.id));
        return rows.map((d) => ({
          id: d.id,
          key: d.key ?? d.id,
          labelEn: d.labelEn ?? d.id,
          labelAr: d.labelAr ?? d.id,
          dataType: d.dataType ?? "Currency",
          required: d.required,
          sortOrder: d.sortOrder ?? 0,
        }));
      },
    },
    submissionMetricValue: {
      findMany: async ({ where }: { where: { submissionId: string; metricDefinitionId: { in: string[] } } }) =>
        submissionMetricValues
          .filter((v) => v.submissionId === where.submissionId && where.metricDefinitionId.in.includes(v.metricDefinitionId))
          .map((v) => ({
            ...v,
            numericValue: v.numericValue === null ? null : { toNumber: () => v.numericValue },
          })),
      upsert: async ({
        where,
        create,
      }: {
        where: { submissionId_metricDefinitionId: { submissionId: string; metricDefinitionId: string } };
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      }) => {
        submissionMetricValues.push(create as unknown as SubmissionMetricValueFixture);
        return { ...where.submissionId_metricDefinitionId, ...create };
      },
    },
    companySubmission: {
      findFirst: async ({ where }: { where: { id?: string; cycle?: { companyId?: string } } }) => {
        if (!state.submission) return null;
        if (where.id && where.id !== state.submission.id) return null;
        if (where.cycle?.companyId && where.cycle.companyId !== state.submission.cycleCompanyId) return null;
        return {
          id: state.submission.id,
          status: state.submission.status,
          cycle: {
            companyId: state.submission.cycleCompanyId,
            templateId: state.submission.templateId,
            periodLabel: state.submission.periodLabel,
            periodStart: state.submission.periodStart,
            periodEnd: state.submission.periodEnd,
            currentDeadline: state.submission.currentDeadline,
          },
        };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; cycle: { companyId: string; company: { archivedAt: null } }; status: string };
        data: { status: string };
      }) => {
        if (!state.submission) return { count: 0 };
        if (where.id !== state.submission.id) return { count: 0 };
        if (where.cycle.companyId !== state.submission.cycleCompanyId) return { count: 0 };
        if (state.submission.companyArchived) return { count: 0 };
        if (where.status !== state.submission.status) return { count: 0 };
        state.lastAppliedPrevStatus = state.submission.status;
        state.submission.status = data.status;
        return { count: 1 };
      },
    },
    submissionWorkflowEvent: {
      count: async () => state.eventCount,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.throwOnEventCreate) throw options.throwOnEventCreate;
        state.eventCount += 1;
        state.lastEventData = data;
        return data;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.auditEvents.push(data);
        return data;
      },
    },
    getLastEventData: () => state.lastEventData,
    getAuditEvents: () => state.auditEvents,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      try {
        return await fn(stub);
      } catch (err) {
        if (state.submission && state.lastAppliedPrevStatus !== undefined) {
          state.submission.status = state.lastAppliedPrevStatus;
        }
        throw err;
      } finally {
        state.lastAppliedPrevStatus = undefined;
      }
    },
  };
  return stub;
}

export interface SignInUserFixture {
  id: string;
  email: string;
  deactivatedAt?: Date | null;
}

export interface SignInTokenFixture {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt?: Date | null;
}

/**
 * Backs requestSignInLink/consumeSignInToken/authorizeSignInToken exactly
 * as those real modules query them: `user.findUnique` by id or email, and
 * `emailVerificationToken.create`/`updateMany`/`findUnique` against a
 * genuinely mutated in-memory token list -- `updateMany`'s conditional
 * WHERE (tokenHash + consumedAt:null + expiresAt:{gt}) really only flips
 * `consumedAt` when it matches, mirroring Postgres semantics, so the same
 * atomic-claim behavior verify-sign-in.ts relies on is exercised for real.
 */
export function makeSignInDbStub(options: { users?: SignInUserFixture[]; tokens?: SignInTokenFixture[] } = {}) {
  const users = options.users ?? [];
  const tokens: SignInTokenFixture[] = (options.tokens ?? []).map((t) => ({ ...t }));
  let nextId = 0;

  return {
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        const user = users.find((u) => (where.id ? u.id === where.id : u.email === where.email));
        if (!user) return null;
        return { id: user.id, email: user.email, deactivatedAt: user.deactivatedAt ?? null };
      },
    },
    emailVerificationToken: {
      create: async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
        const row: SignInTokenFixture = {
          id: `token_${++nextId}`,
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          consumedAt: null,
        };
        tokens.push(row);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { tokenHash: string; consumedAt: null; expiresAt: { gt: Date } };
        data: { consumedAt: Date };
      }) => {
        const row = tokens.find((t) => t.tokenHash === where.tokenHash);
        if (!row) return { count: 0 };
        if (row.consumedAt) return { count: 0 };
        if (!(row.expiresAt.getTime() > where.expiresAt.gt.getTime())) return { count: 0 };
        row.consumedAt = data.consumedAt;
        return { count: 1 };
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const row = tokens.find((t) => t.tokenHash === where.tokenHash);
        if (!row) return null;
        return { userId: row.userId };
      },
    },
    getTokens: () => tokens,
  };
}

export interface PasswordResetTokenFixture {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

/** Backs requestPasswordReset/consumePasswordResetToken (src/lib/auth/password-reset.ts). */
export function makePasswordResetDbStub(
  options: { users?: SignInUserFixture[]; tokens?: PasswordResetTokenFixture[] } = {}
) {
  const users = options.users ?? [];
  const tokens: PasswordResetTokenFixture[] = (options.tokens ?? []).map((t) => ({ ...t }));
  const updatedPasswordHashes: Record<string, string> = {};
  let nextId = 0;

  return {
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        const user = users.find((u) => (where.id ? u.id === where.id : u.email === where.email));
        if (!user) return null;
        return { id: user.id, email: user.email, deactivatedAt: user.deactivatedAt ?? null };
      },
      update: async ({ where, data }: { where: { id: string }; data: { passwordHash: string } }) => {
        updatedPasswordHashes[where.id] = data.passwordHash;
        return { id: where.id, passwordHash: data.passwordHash };
      },
    },
    passwordResetToken: {
      create: async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
        const row: PasswordResetTokenFixture = {
          id: `reset_token_${++nextId}`,
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          consumedAt: null,
        };
        tokens.push(row);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { tokenHash: string; consumedAt: null; expiresAt: { gt: Date } };
        data: { consumedAt: Date };
      }) => {
        const row = tokens.find((t) => t.tokenHash === where.tokenHash);
        if (!row) return { count: 0 };
        if (row.consumedAt) return { count: 0 };
        if (!(row.expiresAt.getTime() > where.expiresAt.gt.getTime())) return { count: 0 };
        row.consumedAt = data.consumedAt;
        return { count: 1 };
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const row = tokens.find((t) => t.tokenHash === where.tokenHash);
        if (!row) return null;
        return { userId: row.userId };
      },
    },
    getTokens: () => tokens,
    getUpdatedPasswordHashes: () => updatedPasswordHashes,
  };
}

export interface ReviewSubmissionFixture {
  id: string;
  status: string;
  companyArchived?: boolean;
}

/**
 * Backs startReview/requestChanges/approveSubmission
 * (src/lib/reporting/review-workflow.ts) exactly as that real module
 * queries them: `userRoleAssignment.findMany` for requireFalakRole, a
 * genuinely-conditional `companySubmission.updateMany` (mirroring
 * Postgres semantics -- only flips status when the WHERE actually
 * matches), `submissionWorkflowEvent.count`/`create`, and
 * `reviewComment.create`. `$transaction` rolls back the status change if
 * its callback throws (e.g. a failed reviewComment.create), simulating
 * Prisma's own interactive-transaction rollback -- the same technique
 * makeReportingDbStub uses for submitCompanySubmission.
 */
export function makeReviewWorkflowDbStub(options: {
  falakRoles?: FalakRoleFixture[];
  submission: ReviewSubmissionFixture | null;
  eventCount?: number;
  throwOnCommentCreate?: Error;
}) {
  const state: {
    submission: ReviewSubmissionFixture | null;
    eventCount: number;
    reviewComments: Record<string, unknown>[];
    auditEvents: Record<string, unknown>[];
    lastEventData?: Record<string, unknown>;
    lastAppliedPrevStatus?: string;
    lastAppliedPrevEventCount?: number;
  } = {
    submission: options.submission ? { ...options.submission } : null,
    eventCount: options.eventCount ?? 0,
    reviewComments: [],
    auditEvents: [],
  };

  const stub = {
    userRoleAssignment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const roleFilter = where.role as { in: string[] };
        return (options.falakRoles ?? [])
          .filter((r) => !r.revoked && roleFilter.in.includes(r.role))
          .map((r) => ({ role: r.role }));
      },
    },
    companySubmission: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status: string };
        data: { status: string };
      }) => {
        if (!state.submission) return { count: 0 };
        if (where.id !== state.submission.id) return { count: 0 };
        if (state.submission.companyArchived) return { count: 0 };
        if (where.status !== state.submission.status) return { count: 0 };
        state.lastAppliedPrevStatus = state.submission.status;
        state.lastAppliedPrevEventCount = state.eventCount;
        state.submission.status = data.status;
        return { count: 1 };
      },
    },
    submissionWorkflowEvent: {
      count: async () => state.eventCount,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.eventCount += 1;
        state.lastEventData = data;
        return data;
      },
    },
    reviewComment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.throwOnCommentCreate) throw options.throwOnCommentCreate;
        state.reviewComments.push(data);
        return data;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.auditEvents.push(data);
        return data;
      },
    },
    getSubmissionStatus: () => state.submission?.status,
    getEventCount: () => state.eventCount,
    getLastEventData: () => state.lastEventData,
    getReviewComments: () => state.reviewComments,
    getAuditEvents: () => state.auditEvents,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      try {
        return await fn(stub);
      } catch (err) {
        if (state.submission && state.lastAppliedPrevStatus !== undefined) {
          state.submission.status = state.lastAppliedPrevStatus;
        }
        if (state.lastAppliedPrevEventCount !== undefined) {
          state.eventCount = state.lastAppliedPrevEventCount;
        }
        throw err;
      } finally {
        state.lastAppliedPrevStatus = undefined;
        state.lastAppliedPrevEventCount = undefined;
      }
    },
  };
  return stub;
}

export interface PublishSubmissionFixture {
  id: string;
  status: string;
  companyArchived?: boolean;
  companyId: string;
  companySlug?: string;
  companyNameEn?: string;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
}

export interface InvestorMembershipFixture {
  investorId: string;
  email: string;
  revoked?: boolean;
}

export interface OwnershipPositionFixture {
  companyId: string;
  holderType: string;
  vehicleId?: string;
  investorId?: string;
}

export interface InvestorVehiclePositionFixture {
  vehicleId: string;
  investorId: string;
  status: string;
}

export interface InvestorFixture {
  id: string;
  archivedAt?: Date | null;
}

/**
 * Backs publishSubmission (src/lib/reporting/publish-workflow.ts) exactly
 * as that real module queries them: userRoleAssignment.findMany for
 * requireFalakRole, companySubmission.findUnique (with the exact
 * cycle/company shape the real select clause reads), report.findFirst/
 * create/update, reportVersion.updateMany/count/create, and the two-path
 * ownershipPosition/investorVehiclePosition/investor resolution --
 * genuinely mutated in-memory arrays, so a second publish call sees the
 * first call's real effects (existing report, prior version count),
 * exactly like Postgres would.
 */
export function makePublishWorkflowDbStub(options: {
  falakRoles?: FalakRoleFixture[];
  submission: PublishSubmissionFixture | null;
  ownershipPositions?: OwnershipPositionFixture[];
  investorVehiclePositions?: InvestorVehiclePositionFixture[];
  investors?: InvestorFixture[];
  investorMemberships?: InvestorMembershipFixture[];
}) {
  let nextId = 0;
  const genId = (prefix: string) => `${prefix}_${++nextId}`;

  const state = {
    reports: [] as Record<string, unknown>[],
    reportVersions: [] as Record<string, unknown>[],
    reportVersionSubmissions: [] as Record<string, unknown>[],
    narrativeSections: [] as Record<string, unknown>[],
    reportAccessGrants: [] as Record<string, unknown>[],
    reportDistributions: [] as Record<string, unknown>[],
    auditEvents: [] as Record<string, unknown>[],
  };

  const stub = {
    userRoleAssignment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const roleFilter = where.role as { in: string[] };
        return (options.falakRoles ?? [])
          .filter((r) => !r.revoked && roleFilter.in.includes(r.role))
          .map((r) => ({ role: r.role }));
      },
    },
    companySubmission: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const s = options.submission;
        if (!s || s.id !== where.id) return null;
        return {
          id: s.id,
          status: s.status,
          cycle: {
            companyId: s.companyId,
            periodLabel: s.periodLabel,
            periodStart: s.periodStart,
            periodEnd: s.periodEnd,
            company: {
              archivedAt: s.companyArchived ? new Date() : null,
              slug: s.companySlug ?? "co-slug",
              nameEn: s.companyNameEn ?? "Co Name",
            },
          },
        };
      },
    },
    report: {
      findFirst: async ({
        where,
      }: {
        where: { scope: string; companyId: string; periodStart: Date; periodEnd: Date };
      }) =>
        state.reports.find(
          (r) =>
            r.scope === where.scope &&
            r.companyId === where.companyId &&
            (r.periodStart as Date).getTime() === where.periodStart.getTime() &&
            (r.periodEnd as Date).getTime() === where.periodEnd.getTime()
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: genId("report"), ...data };
        state.reports.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.reports.find((r) => r.id === where.id);
        if (!row) throw new Error("report not found");
        Object.assign(row, data);
        return row;
      },
    },
    reportVersion: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { reportId: string; isSuperseded: boolean };
        data: { isSuperseded: boolean };
      }) => {
        const matches = state.reportVersions.filter(
          (v) => v.reportId === where.reportId && v.isSuperseded === where.isSuperseded
        );
        matches.forEach((v) => Object.assign(v, data));
        return { count: matches.length };
      },
      count: async ({ where }: { where: { reportId: string } }) =>
        state.reportVersions.filter((v) => v.reportId === where.reportId).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: genId("version"), ...data };
        state.reportVersions.push(row);
        return row;
      },
    },
    reportVersionSubmission: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: genId("rvs"), ...data };
        state.reportVersionSubmissions.push(row);
        return row;
      },
    },
    narrativeSection: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: genId("narrative"), ...data };
        state.narrativeSections.push(row);
        return row;
      },
    },
    ownershipPosition: {
      findMany: async ({ where }: { where: { companyId: string; holderType: string } }) =>
        (options.ownershipPositions ?? [])
          .filter((p) => p.companyId === where.companyId && p.holderType === where.holderType)
          .map((p) => ({ vehicleId: p.vehicleId ?? null, investorId: p.investorId ?? null })),
    },
    investorVehiclePosition: {
      findMany: async ({ where }: { where: { vehicleId: { in: string[] }; status: string } }) => {
        const matches = (options.investorVehiclePositions ?? []).filter(
          (p) => where.vehicleId.in.includes(p.vehicleId) && p.status === where.status
        );
        const distinct = new Map<string, { investorId: string }>();
        for (const m of matches) distinct.set(m.investorId, { investorId: m.investorId });
        return [...distinct.values()];
      },
    },
    investor: {
      findMany: async ({ where }: { where: { id: { in: string[] }; archivedAt: null } }) =>
        (options.investors ?? [])
          .filter((i) => where.id.in.includes(i.id) && !i.archivedAt)
          .map((i) => ({ id: i.id })),
    },
    reportAccessGrant: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: genId("grant"), ...data };
        state.reportAccessGrants.push(row);
        return row;
      },
    },
    investorMembership: {
      findMany: async ({ where }: { where: { investorId: string; revokedAt: null } }) =>
        (options.investorMemberships ?? [])
          .filter((m) => m.investorId === where.investorId && !m.revoked)
          .map((m) => ({ user: { email: m.email } })),
    },
    reportDistribution: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: genId("distribution"), ...data };
        state.reportDistributions.push(row);
        return row;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: genId("audit"), ...data };
        state.auditEvents.push(row);
        return row;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(stub),
    getReports: () => state.reports,
    getReportVersions: () => state.reportVersions,
    getReportVersionSubmissions: () => state.reportVersionSubmissions,
    getNarrativeSections: () => state.narrativeSections,
    getReportAccessGrants: () => state.reportAccessGrants,
    getReportDistributions: () => state.reportDistributions,
    getAuditEvents: () => state.auditEvents,
  };
  return stub;
}

/**
 * Generic stub for the admin CRUD actions (src/app/admin/actions.ts) and
 * the accept-invite actions (src/app/accept-invite/actions.ts). Unlike the
 * other factories above, this one doesn't hardcode a fixed set of models --
 * each test supplies exactly the model methods its action path touches via
 * `options.models` (e.g. `{ company: { findUnique: ..., create: ... } }`),
 * and this factory adds the three things every one of those actions needs
 * regardless of which models it touches: `userRoleAssignment.findMany`
 * (backs requireFalakRole), a `$transaction` that just invokes its
 * callback with this same stub (these actions don't rely on rollback
 * semantics the way the workflow stubs above do), and an `auditEvent.create`
 * spy + `getAuditEvents()` accessor so a test can assert the one audit row
 * each action's transaction is expected to write.
 */
export function makeAdminActionDbStub(options: {
  falakRoles?: FalakRoleFixture[];
  models?: Record<string, Record<string, (...args: never[]) => unknown>>;
}) {
  const auditEvents: Record<string, unknown>[] = [];
  const stub = {
    userRoleAssignment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const roleFilter = where.role as { in: string[] };
        return (options.falakRoles ?? [])
          .filter((r) => !r.revoked && roleFilter.in.includes(r.role))
          .map((r) => ({ role: r.role }));
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push(data);
        return data;
      },
    },
    getAuditEvents: (): Record<string, unknown>[] => auditEvents,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(stub),
    ...(options.models ?? {}),
  };
  return stub;
}

export interface InvestorMembershipFixture {
  userId: string;
  investorId: string;
  investorNameEn: string;
  investorNameAr: string;
  revoked?: boolean;
  investorArchived?: boolean;
}

export interface ReportAccessGrantFixture {
  investorId: string;
  reviewNotes?: { textEn: string; textAr: string };
  revoked?: boolean;
  reportVersionId: string;
  versionNo: number;
  publishedAt: Date | null;
  reportId: string;
  scope?: string;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  companyId: string;
  companyArchived?: boolean;
  companyNameEn: string;
  companyNameAr: string;
  companySlug: string;
  companySectorEn: string;
  companySectorAr: string;
  companyCustomerModel: string;
  companyRevenueModels: string[];
  companyCurrency: string;
  companyEntryStage: string;
  companyCurrentStage: string;
  submissionId: string;
  revenue: number | null;
  isNa?: boolean;
}

export interface InvestorVehiclePositionFixtureForQueries {
  investorId: string;
  vehicleId: string;
  status: string;
  commitmentAmount?: number | null;
  currency?: string;
}

export interface VehicleFixture {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  type: string;
  currency: string;
  archivedAt?: Date | null;
}

export interface OwnershipLinkFixture {
  vehicleId: string;
  companyId: string;
  companyNameEn?: string;
  companyNameAr?: string;
  companySlug?: string;
  companySectorEn?: string;
  companySectorAr?: string;
}

export interface NavSnapshotFixtureForQueries {
  vehicleId: string;
  asOfDate: Date;
  navAmount: number;
  currency: string;
}

/**
 * Backs getInvestorPortfolioData (src/lib/investor/queries.ts) exactly as
 * that real module queries them: investorMembership.findMany (scoped to
 * userId, revokedAt: null, investor.archivedAt: null),
 * reportAccessGrant.findMany (nested reportVersion/report/company/
 * submissions/metricValues select, filtered to scope COMPANY and a
 * non-archived company), investorVehiclePosition.findMany (status
 * Active), vehicle.findMany, and ownershipPosition.findMany (holderType
 * VEHICLE). Revenue fixtures carry a numericValue-like `.toNumber()`
 * wrapper to match the real Prisma Decimal API the query calls.
 */
export function makeInvestorQueriesDbStub(options: {
  memberships?: InvestorMembershipFixture[];
  reportAccessGrants?: ReportAccessGrantFixture[];
  investorVehiclePositions?: InvestorVehiclePositionFixtureForQueries[];
  vehicles?: VehicleFixture[];
  ownershipLinks?: OwnershipLinkFixture[];
  navSnapshots?: NavSnapshotFixtureForQueries[];
}) {
  const memberships = options.memberships ?? [];
  const grants = options.reportAccessGrants ?? [];
  const vehiclePositions = options.investorVehiclePositions ?? [];
  const vehicles = options.vehicles ?? [];
  const ownershipLinks = options.ownershipLinks ?? [];
  const navSnapshots = options.navSnapshots ?? [];

  return {
    investorMembership: {
      findMany: async ({ where }: { where: { userId: string; revokedAt: null; investor: { archivedAt: null } } }) =>
        memberships
          .filter((m) => m.userId === where.userId && !m.revoked && !m.investorArchived)
          .map((m) => ({
            investorId: m.investorId,
            investor: { nameEn: m.investorNameEn, nameAr: m.investorNameAr },
          })),
    },
    reportAccessGrant: {
      findMany: async ({
        where,
      }: {
        where: { investorId: { in: string[] }; revokedAt: null; reportVersion: { report: { scope: string; company: { archivedAt: null } } } };
      }) =>
        grants
          .filter(
            (g) =>
              where.investorId.in.includes(g.investorId) &&
              !g.revoked &&
              (g.scope ?? "COMPANY") === "COMPANY" &&
              !g.companyArchived
          )
          .map((g) => ({
            investorId: g.investorId,
            reportVersion: {
              id: g.reportVersionId,
              versionNo: g.versionNo,
              publishedAt: g.publishedAt,
              narratives: g.reviewNotes ? [g.reviewNotes] : [],
              report: {
                id: g.reportId,
                periodLabel: g.periodLabel,
                periodStart: g.periodStart,
                periodEnd: g.periodEnd,
                company: {
                  id: g.companyId,
                  slug: g.companySlug,
                  nameEn: g.companyNameEn,
                  nameAr: g.companyNameAr,
                  sectorEn: g.companySectorEn,
                  sectorAr: g.companySectorAr,
                  customerModel: g.companyCustomerModel,
                  revenueModels: g.companyRevenueModels,
                  currency: g.companyCurrency,
                  entryStage: g.companyEntryStage,
                  currentStage: g.companyCurrentStage,
                },
              },
              submissions: [
                {
                  submission: {
                    metricValues:
                      g.revenue === null && !g.isNa
                        ? []
                        : [
                            {
                              metricDefinition: { key: "revenue_b2b" },
                              numericValue: g.revenue === null ? null : { toNumber: () => g.revenue },
                              isNa: g.isNa ?? false,
                            },
                          ],
                  },
                },
              ],
            },
          })),
    },
    investorVehiclePosition: {
      // Two shapes: this org's positions (investorId filter), and every
      // investor's positions on the org's vehicles (vehicleId filter).
      findMany: async ({
        where,
      }: {
        where: { investorId?: { in: string[] }; vehicleId?: { in: string[] }; status: string };
      }) =>
        vehiclePositions
          .filter(
            (p) =>
              p.status === where.status &&
              (!where.investorId || where.investorId.in.includes(p.investorId)) &&
              (!where.vehicleId || where.vehicleId.in.includes(p.vehicleId))
          )
          .map((p) => ({
            investorId: p.investorId,
            vehicleId: p.vehicleId,
            commitmentAmount: p.commitmentAmount == null ? null : { toNumber: () => p.commitmentAmount },
            currency: p.currency ?? "SAR",
          })),
    },
    vehicleNavSnapshot: {
      findMany: async ({ where }: { where: { vehicleId: { in: string[] } } }) =>
        navSnapshots
          .filter((n) => where.vehicleId.in.includes(n.vehicleId))
          .sort((a, b) => a.asOfDate.getTime() - b.asOfDate.getTime())
          .map((n) => ({ vehicleId: n.vehicleId, asOfDate: n.asOfDate, navAmount: { toNumber: () => n.navAmount }, currency: n.currency })),
    },
    vehicle: {
      findMany: async ({ where }: { where: { id: { in: string[] }; archivedAt: null } }) =>
        vehicles
          .filter((v) => where.id.in.includes(v.id) && !v.archivedAt)
          .map((v) => ({ id: v.id, slug: v.slug, nameEn: v.nameEn, nameAr: v.nameAr, type: v.type, currency: v.currency })),
    },
    ownershipPosition: {
      findMany: async ({ where }: { where: { vehicleId: { in: string[] }; holderType: string } }) =>
        ownershipLinks
          .filter((l) => where.vehicleId.in.includes(l.vehicleId))
          .map((l) => ({
            vehicleId: l.vehicleId,
            company: {
              id: l.companyId,
              slug: l.companySlug ?? l.companyId,
              nameEn: l.companyNameEn ?? l.companyId,
              nameAr: l.companyNameAr ?? l.companyId,
              sectorEn: l.companySectorEn ?? "SaaS",
              sectorAr: l.companySectorAr ?? "SaaS",
            },
          })),
    },
  };
}

export interface CompanyReportCycleFixture {
  id: string;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  currentDeadline: Date;
  submission: null | {
    id: string;
    status: string;
    updatedAt: Date;
    revenue: number | null;
    isNa?: boolean;
  };
}

export interface CompanyReportReportFixture {
  periodStart: Date;
  periodEnd: Date;
  scope?: string;
  versions: { isSuperseded: boolean; narratives: { kind: string; textEn: string; textAr: string }[] }[];
}

export interface CompanyReportVehicleLinkFixture {
  vehicleArchived?: boolean;
  vehicle: { id: string; slug: string; nameEn: string; nameAr: string; type: string; currency: string };
  agreements?: { id?: string; signedDate: Date; investedAmount: number | null; currency: string | null; ownershipPct: number | null }[];
}

export interface CompanyReportCompanyFixture {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  sectorEn: string;
  sectorAr: string;
  customerModel: string;
  revenueModels: string[];
  currency: string;
  entryStage: string;
  currentStage: string;
  archivedAt?: Date | null;
  cycles?: CompanyReportCycleFixture[];
  reports?: CompanyReportReportFixture[];
  vehicleLinks?: CompanyReportVehicleLinkFixture[];
  valuations?: { asOfDate: Date; valuationAmount: number; valuationType: string }[];
}

/**
 * Backs getCompanyReportData (src/lib/company/queries.ts): userRoleAssignment
 * .findMany for requireFalakRole, companyMembership.findFirst for
 * requireCompanyMembership, and a single company.findUnique returning the
 * full nested cycles/reports/ownershipPositions shape the real query
 * selects -- computed directly from the fixture rather than parsing the
 * caller's actual `where`/`select` args (same simplification every other
 * stub factory in this file already makes). The scope/isSuperseded
 * filtering the real query pushes into Prisma's `where` is replicated here
 * in the fixture-to-response mapping, not by inspecting the call args.
 */
export function makeCompanyReportDbStub(options: {
  falakRoles?: FalakRoleFixture[];
  companyMemberships?: MembershipFixture[];
  companies?: CompanyReportCompanyFixture[];
}) {
  const companies = options.companies ?? [];
  const findUniqueCalls: string[] = [];
  let companyFindManyCallCount = 0;

  return {
    getCompanyFindManyCallCount: () => companyFindManyCallCount,
    userRoleAssignment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const roleFilter = where.role as { in: string[] };
        return (options.falakRoles ?? [])
          .filter((r) => !r.revoked && roleFilter.in.includes(r.role))
          .map((r) => ({ role: r.role }));
      },
    },
    // No fixture builder in this suite sets up metric-definition rows --
    // these tests assert on status/revenue/narratives, never on
    // `metrics`, so fetchSubmissionMetricFields just resolves to [].
    metricDefinition: {
      findMany: async () => [],
    },
    submissionMetricValue: {
      findMany: async () => [],
    },
    companyMembership: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const m = (options.companyMemberships ?? []).find(
          (mm) => mm.userId === where.userId && mm.companyId === where.companyId
        );
        if (!m) return null;
        if (m.revoked) return null;
        if (m.archived) return null;
        const roleFilter = where.role as { in: string[] };
        if (!roleFilter.in.includes(m.role)) return null;
        return { role: m.role };
      },
    },
    company: {
      // Backs getPortfolioBenchmarks' own internal company.findMany
      // (called from getCompanyReportData for a FALAK_STAFF viewer, to
      // compute this company's own inline percentile) -- metricDefinition/
      // submissionMetricValue both resolve to [] above, so every company
      // ends up with zero benchmark metrics here, which is a safe, valid
      // result for every test in this suite (none of them assert on
      // `benchmarks`).
      findMany: async ({ select }: { select?: { cycles?: { where?: { periodLabel?: string } } } } = {}) => {
        companyFindManyCallCount += 1;
        const periodLabel = select?.cycles?.where?.periodLabel;
        return companies
          .filter((c) => !c.archivedAt)
          .map((c) => ({
            id: c.id,
            slug: c.slug,
            nameEn: c.nameEn,
            nameAr: c.nameAr,
            cycles: (c.cycles ?? [])
              .filter((cy) => !periodLabel || cy.periodLabel === periodLabel)
              .map((cy) => ({
                templateId: "stub-template",
                submission: cy.submission === null ? null : { id: cy.submission.id },
              })),
          }));
      },
      findUnique: async ({ where }: { where: { slug: string } }) => {
        findUniqueCalls.push(where.slug);
        const c = companies.find((cc) => cc.slug === where.slug);
        if (!c) return null;
        return {
          id: c.id,
          slug: c.slug,
          nameEn: c.nameEn,
          nameAr: c.nameAr,
          sectorEn: c.sectorEn,
          sectorAr: c.sectorAr,
          customerModel: c.customerModel,
          revenueModels: c.revenueModels,
          currency: c.currency,
          entryStage: c.entryStage,
          currentStage: c.currentStage,
          archivedAt: c.archivedAt ?? null,
          cycles: (c.cycles ?? []).map((cy) => ({
            id: cy.id,
            periodLabel: cy.periodLabel,
            periodStart: cy.periodStart,
            periodEnd: cy.periodEnd,
            currentDeadline: cy.currentDeadline,
            template: { nameEn: "Quarterly Report", nameAr: "التقرير الربعي" },
            submission: cy.submission
              ? {
                  id: cy.submission.id,
                  status: cy.submission.status,
                  updatedAt: cy.submission.updatedAt,
                  metricValues:
                    cy.submission.revenue === null && !cy.submission.isNa
                      ? []
                      : [
                          {
                            metricDefinition: { key: "revenue_b2b" },
                            numericValue:
                              cy.submission.revenue === null ? null : { toNumber: () => cy.submission!.revenue },
                            isNa: cy.submission.isNa ?? false,
                          },
                        ],
                }
              : null,
          })),
          reports: (c.reports ?? [])
            .filter((r) => (r.scope ?? "COMPANY") === "COMPANY")
            .map((r) => ({
              periodStart: r.periodStart,
              periodEnd: r.periodEnd,
              versions: r.versions.filter((v) => v.isSuperseded === false).map((v) => ({ narratives: v.narratives })),
            })),
          ownershipPositions: (c.vehicleLinks ?? [])
            .filter((l) => !l.vehicleArchived)
            .map((l) => ({
              vehicle: l.vehicle,
              agreements: (l.agreements ?? []).map((a, n) => ({
                id: a.id ?? `agr_${n + 1}`,
                signedDate: a.signedDate,
                investedAmount: a.investedAmount === null ? null : { toNumber: () => a.investedAmount },
                currency: a.currency,
                ownershipPct: a.ownershipPct === null ? null : { toNumber: () => a.ownershipPct },
              })),
            })),
          valuations: (c.valuations ?? []).map((v) => ({
            asOfDate: v.asOfDate,
            valuationAmount: { toNumber: () => v.valuationAmount },
            valuationType: v.valuationType,
          })),
        };
      },
    },
    getFindUniqueCalls: (): string[] => findUniqueCalls,
  };
}

export interface VehicleQueriesCompanyFixture {
  id: string;
  slug: string;
  nameEn: string;
  archived?: boolean;
  currency?: string;
  cycles?: CompanyReportCycleFixture[];
}

export interface VehicleQueriesInvestorPositionFixture {
  investor: { id: string; nameEn: string; nameAr: string; type: string };
  status: string;
  investorArchived?: boolean;
}

export interface VehicleQueriesVehicleFixture {
  id: string;
  slug: string;
  nameEn: string;
  nameAr?: string;
  type?: string;
  currency?: string;
  department?: string;
  archived?: boolean;
  companies?: VehicleQueriesCompanyFixture[];
  investorPositions?: VehicleQueriesInvestorPositionFixture[];
}

/**
 * Backs getVehicleDirectoryData/getVehicleDashboardData
 * (src/lib/vehicle/queries.ts): userRoleAssignment.findMany for
 * requireFalakRole, plus vehicle.findMany/findUnique returning the nested
 * ownershipPositions/positions shape the real queries select. The
 * Prisma-side filters (holderType VEHICLE, company.archivedAt null,
 * status Active, investor.archivedAt null, and archivedAt null on the
 * directory's vehicle list) are replicated in the fixture mapping, same
 * simplification every other factory in this file makes.
 */
export function makeVehicleDbStub(options: { falakRoles?: FalakRoleFixture[]; vehicles?: VehicleQueriesVehicleFixture[] }) {
  const vehicles = options.vehicles ?? [];

  const toCompanyRow = (c: VehicleQueriesCompanyFixture) => ({
    id: c.id,
    slug: c.slug,
    nameEn: c.nameEn,
    nameAr: c.nameEn,
    sectorEn: "SaaS",
    sectorAr: "SaaS",
    customerModel: "B2B",
    revenueModels: ["SaaS"],
    currency: c.currency ?? "SAR",
    entryStage: "Seed",
    currentStage: "Seed",
    cycles: (c.cycles ?? []).map((cy) => ({
      periodLabel: cy.periodLabel,
      periodStart: cy.periodStart,
      periodEnd: cy.periodEnd,
      currentDeadline: cy.currentDeadline,
      submission: cy.submission
        ? {
            status: cy.submission.status,
            updatedAt: cy.submission.updatedAt,
            metricValues:
              cy.submission.revenue === null && !cy.submission.isNa
                ? []
                : [
                    {
                      metricDefinition: { key: "revenue_b2b" },
                      numericValue: cy.submission.revenue === null ? null : { toNumber: () => cy.submission!.revenue },
                      isNa: cy.submission.isNa ?? false,
                    },
                  ],
          }
        : null,
    })),
  });

  const liveCompanies = (v: VehicleQueriesVehicleFixture) => (v.companies ?? []).filter((c) => !c.archived);
  const liveInvestorPositions = (v: VehicleQueriesVehicleFixture) =>
    (v.investorPositions ?? []).filter((p) => p.status === "Active" && !p.investorArchived);

  const vehicleBase = (v: VehicleQueriesVehicleFixture) => ({
    id: v.id,
    slug: v.slug,
    nameEn: v.nameEn,
    nameAr: v.nameAr ?? v.nameEn,
    type: v.type ?? "Fund",
    currency: v.currency ?? "SAR",
    department: v.department ?? DEFAULT_STUB_DEPARTMENT,
  });

  return {
    userRoleAssignment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const roleFilter = where.role as { in: string[] };
        return (options.falakRoles ?? [])
          .filter((r) => !r.revoked && roleFilter.in.includes(r.role))
          .map((r) => ({ role: r.role }));
      },
    },
    vehicle: {
      findMany: async () =>
        vehicles
          .filter((v) => !v.archived)
          .map((v) => ({
            ...vehicleBase(v),
            ownershipPositions: liveCompanies(v).map((c) => ({ companyId: c.id })),
            positions: liveInvestorPositions(v).map((p) => ({ investorId: p.investor.id })),
          })),
      findUnique: async ({ where }: { where: { slug: string } }) => {
        const v = vehicles.find((vv) => vv.slug === where.slug);
        if (!v) return null;
        return {
          ...vehicleBase(v),
          ownershipPositions: liveCompanies(v).map((c) => ({ company: toCompanyRow(c) })),
          positions: liveInvestorPositions(v).map((p) => ({ investor: p.investor })),
        };
      },
    },
  };
}

export interface MyCompaniesMembershipFixture {
  userId: string;
  role: string;
  revoked?: boolean;
  company: {
    id: string;
    slug: string;
    nameEn: string;
    archived?: boolean;
    cycles?: { periodLabel: string; periodStart: Date; currentDeadline: Date; submissionStatus: string | null }[];
  };
}

/**
 * Backs getMyCompaniesData (src/lib/submit/queries.ts): one
 * companyMembership.findMany scoped to the caller's userId, excluding
 * revoked memberships and archived companies, ordered by company nameEn,
 * with each company's single most recent cycle (orderBy periodStart desc,
 * take 1) -- the filters/ordering the real query pushes into Prisma are
 * replicated here from the fixture.
 */
export function makeMyCompaniesDbStub(options: { memberships?: MyCompaniesMembershipFixture[] }) {
  const memberships = options.memberships ?? [];
  return {
    companyMembership: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        memberships
          .filter((m) => m.userId === where.userId && !m.revoked && !m.company.archived)
          .sort((a, b) => a.company.nameEn.localeCompare(b.company.nameEn))
          .map((m) => ({
            role: m.role,
            company: {
              id: m.company.id,
              slug: m.company.slug,
              nameEn: m.company.nameEn,
              nameAr: m.company.nameEn,
              cycles: [...(m.company.cycles ?? [])]
                .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime())
                .slice(0, 1)
                .map((c) => ({
                  periodLabel: c.periodLabel,
                  currentDeadline: c.currentDeadline,
                  submission: c.submissionStatus === null ? null : { status: c.submissionStatus },
                })),
            },
          })),
    },
  };
}

export interface ReminderCycleFixture {
  id: string;
  periodLabel: string;
  currentDeadline: Date;
  lastReminderSentAt?: Date | null;
  companySlug: string;
  companyNameEn: string;
  memberEmails: string[];
  submissionStatus: string | null;
}

/**
 * Backs sendDueReminders (src/lib/reporting/reminders.ts). Only
 * `reportingCycle.findMany`/`.update` are needed -- the function never
 * touches any other model. `findMany`'s `where` is accepted but not
 * re-validated here (unlike the richer stubs above): every fixture this
 * factory is handed is assumed to already match the production query's
 * `status: "Open"` + `company.archivedAt: null` shape, so the stub just
 * returns them filtered by the one thing the function's own logic (not
 * its Prisma query) actually varies on in tests -- nothing, it returns
 * every fixture and lets sendDueReminders' own date/cooldown math decide
 * what to act on, which is the real behavior under test.
 */
export function makeRemindersDbStub(cycles: ReminderCycleFixture[]) {
  const state = cycles.map((c) => ({ ...c }));
  const updates: { id: string; lastReminderSentAt: Date; lastReminderKind: string }[] = [];

  return {
    reportingCycle: {
      findMany: async () =>
        state
          .filter((c) => c.submissionStatus === null || c.submissionStatus === "draft" || c.submissionStatus === "changes_requested")
          .map((c) => ({
            id: c.id,
            periodLabel: c.periodLabel,
            currentDeadline: c.currentDeadline,
            lastReminderSentAt: c.lastReminderSentAt ?? null,
            company: {
              slug: c.companySlug,
              nameEn: c.companyNameEn,
              memberships: c.memberEmails.map((email) => ({ user: { email } })),
            },
          })),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { lastReminderSentAt: Date; lastReminderKind: string };
      }) => {
        const row = state.find((c) => c.id === where.id);
        if (!row) throw new Error("cycle not found");
        row.lastReminderSentAt = data.lastReminderSentAt;
        updates.push({ id: where.id, ...data });
        return row;
      },
    },
    getUpdates: () => updates,
  };
}

export interface AlertCycleFixture {
  templateId: string;
  currentDeadline: Date;
  submissionId: string | null;
  submissionStatus: string | null;
}

export interface AlertCompanyFixture {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  archivedAt?: Date | null;
  cycles: AlertCycleFixture[];
}

export interface AlertMetricValueFixture {
  key: string;
  value: string | number | null;
  isNa?: boolean;
  dataType?: string;
}

/**
 * Backs getPortfolioAlerts (src/lib/admin/alerts.ts). Each company
 * fixture's LATEST cycle with a non-null submissionId gets its metric
 * values looked up from `metricsBySubmissionId` -- the same
 * fetchSubmissionMetricFields helper the real function calls, backed
 * here by a plain lookup table rather than re-deriving MetricDefinition
 * rows, since alerts.ts only ever reads three specific keys regardless
 * of what else a real template defines.
 */
export function makePortfolioAlertsDbStub(options: {
  falakRoles?: FalakRoleFixture[];
  companies: AlertCompanyFixture[];
  metricsBySubmissionId?: Record<string, AlertMetricValueFixture[]>;
}) {
  const metricsBySubmissionId = options.metricsBySubmissionId ?? {};

  return {
    userRoleAssignment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const roleFilter = where.role as { in: string[] };
        return (options.falakRoles ?? [])
          .filter((r) => !r.revoked && roleFilter.in.includes(r.role))
          .map((r) => ({ role: r.role }));
      },
    },
    company: {
      findMany: async ({ where }: { where?: { id?: { in: string[] } } } = {}) =>
        options.companies
          .filter((c) => !c.archivedAt)
          .filter((c) => !where?.id || where.id.in.includes(c.id))
          .map((c) => ({
            id: c.id,
            slug: c.slug,
            nameEn: c.nameEn,
            nameAr: c.nameAr,
            cycles: c.cycles.map((cy) => ({
              templateId: cy.templateId,
              currentDeadline: cy.currentDeadline,
              submission: cy.submissionId === null ? null : { id: cy.submissionId, status: cy.submissionStatus },
            })),
          })),
    },
    metricDefinition: {
      // templateId isn't actually distinguishing in this stub -- every
      // submission fixture supplies its own metric list keyed by
      // submissionId instead (see submissionMetricValue.findMany below)
      // -- so this just returns one definition row per unique key seen
      // across all fixtures, enough for fetchSubmissionMetricFields to
      // resolve ids and dataTypes from.
      findMany: async () => {
        const allRows = Object.values(metricsBySubmissionId).flat();
        const byKey = new Map<string, AlertMetricValueFixture>();
        for (const row of allRows) if (!byKey.has(row.key)) byKey.set(row.key, row);
        return [...byKey.entries()].map(([key, row]) => ({
          id: `def_${key}`,
          key,
          labelEn: key,
          labelAr: key,
          dataType: row.dataType ?? "Number",
          required: false,
          sortOrder: 0,
        }));
      },
    },
    submissionMetricValue: {
      findMany: async ({ where }: { where: { submissionId: string } }) => {
        const rows = metricsBySubmissionId[where.submissionId] ?? [];
        return rows.map((r) => ({
          metricDefinitionId: `def_${r.key}`,
          numericValue: typeof r.value === "number" ? { toNumber: () => r.value } : null,
          textValue: typeof r.value === "string" ? r.value : null,
          isNa: r.isNa ?? false,
        }));
      },
    },
  };
}

/**
 * Shared by makeBenchmarksDbStub/makeTrendDbStub below (and conceptually
 * the same shape makePortfolioAlertsDbStub's own metricDefinition/
 * submissionMetricValue pair already hand-rolled) -- backs
 * fetchSubmissionMetricFields for any test that only cares about a
 * handful of metric keys, keyed by submissionId rather than by a real
 * MetricDefinition/templateId relationship.
 */
function makeMetricLookupModels(metricsBySubmissionId: Record<string, AlertMetricValueFixture[]>) {
  return {
    metricDefinition: {
      findMany: async () => {
        const allRows = Object.values(metricsBySubmissionId).flat();
        const byKey = new Map<string, AlertMetricValueFixture>();
        for (const row of allRows) if (!byKey.has(row.key)) byKey.set(row.key, row);
        return [...byKey.entries()].map(([key, row]) => ({
          id: `def_${key}`,
          key,
          labelEn: key,
          labelAr: key,
          dataType: row.dataType ?? "Number",
          required: false,
          sortOrder: 0,
        }));
      },
    },
    submissionMetricValue: {
      findMany: async ({ where }: { where: { submissionId: string } }) => {
        const rows = metricsBySubmissionId[where.submissionId] ?? [];
        return rows.map((r) => ({
          metricDefinitionId: `def_${r.key}`,
          numericValue: typeof r.value === "number" ? { toNumber: () => r.value } : null,
          textValue: typeof r.value === "string" ? r.value : null,
          isNa: r.isNa ?? false,
        }));
      },
    },
  };
}

export interface BenchmarkCycleFixture {
  periodLabel: string;
  templateId: string;
  submissionId: string | null;
}

export interface BenchmarkCompanyFixture {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  archivedAt?: Date | null;
  cycles: BenchmarkCycleFixture[];
}

/** Backs getPortfolioBenchmarks (src/lib/admin/benchmarking.ts). */
export function makeBenchmarksDbStub(options: {
  falakRoles?: FalakRoleFixture[];
  companies: BenchmarkCompanyFixture[];
  metricsBySubmissionId?: Record<string, AlertMetricValueFixture[]>;
}) {
  return {
    userRoleAssignment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const roleFilter = where.role as { in: string[] };
        return (options.falakRoles ?? [])
          .filter((r) => !r.revoked && roleFilter.in.includes(r.role))
          .map((r) => ({ role: r.role }));
      },
    },
    company: {
      findMany: async ({ select }: { select: { cycles: { where: { periodLabel: string } } } }) => {
        const periodLabel = select.cycles.where.periodLabel;
        return options.companies
          .filter((c) => !c.archivedAt)
          .map((c) => ({
            id: c.id,
            slug: c.slug,
            nameEn: c.nameEn,
            nameAr: c.nameAr,
            cycles: c.cycles
              .filter((cy) => cy.periodLabel === periodLabel)
              .map((cy) => ({
                templateId: cy.templateId,
                submission: cy.submissionId === null ? null : { id: cy.submissionId },
              })),
          }));
      },
    },
    ...makeMetricLookupModels(options.metricsBySubmissionId ?? {}),
  };
}

/**
 * Installs a spy in place of uploadAttachment that returns a fixed
 * pathname/size -- same "never a real network call" discipline as
 * setSendEmailSpy, backing src/lib/storage/blob.ts's one real I/O
 * boundary for file storage.
 */
export function setUploadAttachmentSpy(result?: { pathname?: string; size?: number }) {
  const calls: { pathname: string; contentType: string }[] = [];
  (globalThis as Record<string, unknown>).__TEST_UPLOAD_ATTACHMENT_STUB__ = async (
    pathname: string,
    body: { size?: number },
    contentType: string
  ) => {
    calls.push({ pathname, contentType });
    return { pathname: result?.pathname ?? pathname, size: result?.size ?? body.size ?? 0, contentType };
  };
  return calls;
}

export function setUploadAttachmentFailureSpy() {
  (globalThis as Record<string, unknown>).__TEST_UPLOAD_ATTACHMENT_STUB__ = async () => {
    throw new Error("upload failed");
  };
}

/** Backs uploadSubmissionAttachment (src/lib/reporting/attachments.ts). */
export function makeAttachmentUploadDbStub(options: {
  falakRoles?: FalakRoleFixture[];
  submission: { id: string; cycleCompanyId: string; status: string; companyArchived?: boolean } | null;
}) {
  const createdAttachments: Record<string, unknown>[] = [];
  return {
    userRoleAssignment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const roleFilter = where.role as { in: string[] };
        return (options.falakRoles ?? [])
          .filter((r) => !r.revoked && roleFilter.in.includes(r.role))
          .map((r) => ({ role: r.role }));
      },
    },
    companySubmission: {
      findFirst: async ({ where }: { where: { id?: string } }) => {
        const s = options.submission;
        if (!s) return null;
        if (where.id && where.id !== s.id) return null;
        if (s.companyArchived) return null;
        return { id: s.id, status: s.status };
      },
    },
    attachment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `att_${createdAttachments.length + 1}`, ...data };
        createdAttachments.push(row);
        return row;
      },
    },
    getCreatedAttachments: () => createdAttachments,
  };
}

export interface AuditEventFixture {
  id: string;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: Date;
}

/** Backs getAuditEvents (src/lib/admin/audit.ts). */
export function makeAuditEventsDbStub(options: { falakRoles?: FalakRoleFixture[]; events?: AuditEventFixture[] }) {
  const events = [...(options.events ?? [])].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    userRoleAssignment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const roleFilter = where.role as { in: string[] };
        return (options.falakRoles ?? [])
          .filter((r) => !r.revoked && roleFilter.in.includes(r.role))
          .map((r) => ({ role: r.role }));
      },
    },
    auditEvent: {
      findMany: async ({
        where,
        skip,
        take,
        distinct,
      }: {
        where?: { action?: string };
        skip?: number;
        take?: number;
        distinct?: string[];
      }) => {
        if (distinct) {
          const seen = new Set<string>();
          return events
            .filter((e) => {
              if (seen.has(e.action)) return false;
              seen.add(e.action);
              return true;
            })
            .map((e) => ({ action: e.action }))
            .sort((a, b) => a.action.localeCompare(b.action));
        }
        const filtered = where?.action ? events.filter((e) => e.action === where.action) : events;
        const sliced = filtered.slice(skip ?? 0, (skip ?? 0) + (take ?? filtered.length));
        return sliced.map((e) => ({
          id: e.id,
          action: e.action,
          targetType: e.targetType,
          targetId: e.targetId,
          createdAt: e.createdAt,
          actor: e.actorEmail === null ? null : { email: e.actorEmail },
        }));
      },
    },
  };
}

export interface ReturnsMembershipFixture {
  userId: string;
  investorId: string;
  role: string;
  revoked?: boolean;
  investorArchived?: boolean;
}

export interface ReturnsTransactionFixture {
  type: string;
  amount: number;
  currency: string;
  transactionDate: Date;
}

export interface ReturnsVehiclePositionFixture {
  vehicleId: string;
  ownershipPct: number | null;
  currency: string;
}

export interface ReturnsNavSnapshotFixture {
  vehicleId: string;
  asOfDate: Date;
  navAmount: number;
  currency: string;
}

/** Backs getInvestorReturns (src/lib/investor/returns.ts). */
export function makeInvestorReturnsDbStub(options: {
  membership?: ReturnsMembershipFixture | null;
  transactions?: ReturnsTransactionFixture[];
  vehiclePositions?: ReturnsVehiclePositionFixture[];
  navSnapshots?: ReturnsNavSnapshotFixture[];
}) {
  const transactions = options.transactions ?? [];
  const vehiclePositions = options.vehiclePositions ?? [];
  const navSnapshots = [...(options.navSnapshots ?? [])].sort((a, b) => b.asOfDate.getTime() - a.asOfDate.getTime());

  return {
    investorMembership: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const m = options.membership;
        if (!m) return null;
        if (where.userId !== m.userId) return null;
        if (where.investorId !== m.investorId) return null;
        if (m.revoked) return null;
        if (m.investorArchived) return null;
        const roleFilter = where.role as { in: string[] };
        if (!roleFilter.in.includes(m.role)) return null;
        return { role: m.role };
      },
    },
    investorCapitalTransaction: {
      findMany: async () =>
        transactions.map((t) => ({
          type: t.type,
          amount: { toNumber: () => t.amount },
          currency: t.currency,
          transactionDate: t.transactionDate,
        })),
    },
    investorVehiclePosition: {
      findMany: async () =>
        vehiclePositions.map((p) => ({
          vehicleId: p.vehicleId,
          ownershipPct: p.ownershipPct === null ? null : { toNumber: () => p.ownershipPct },
          currency: p.currency,
        })),
    },
    vehicleNavSnapshot: {
      findFirst: async ({ where }: { where: { vehicleId: string } }) => {
        const match = navSnapshots.find((n) => n.vehicleId === where.vehicleId);
        if (!match) return null;
        return { navAmount: { toNumber: () => match.navAmount }, currency: match.currency };
      },
    },
  };
}

/** Backs getViewerNavFlags (src/lib/auth/viewer-roles.ts). */
export function makeViewerNavFlagsDbStub(options: {
  hasFalakRole?: boolean;
  falakRole?: string;
  hasCompanyMembership?: boolean;
  hasInvestorMembership?: boolean;
}) {
  return {
    userRoleAssignment: {
      findMany: async () =>
        options.hasFalakRole ? [{ role: options.falakRole ?? "FALAK_OPERATIONS" }] : [],
    },
    companyMembership: {
      findFirst: async () => (options.hasCompanyMembership ? { id: "cm_1" } : null),
    },
    investorMembership: {
      findFirst: async () => (options.hasInvestorMembership ? { id: "im_1" } : null),
    },
  };
}

export interface TrendsCycleFixture {
  periodLabel: string;
  periodStart: Date;
  templateId: string;
  submissionId: string | null;
  revenueMetricValues?: { key: string; value: number | null; isNa?: boolean }[];
}

export interface TrendsCompanyFixture {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  currency: string;
  archivedAt?: Date | null;
  cycles: TrendsCycleFixture[];
}

/** Backs getCompanyPerformanceTrends (src/lib/admin/company-trends.ts). */
export function makeCompanyTrendsDbStub(options: {
  falakRoles?: FalakRoleFixture[];
  companies: TrendsCompanyFixture[];
  metricsBySubmissionId?: Record<string, AlertMetricValueFixture[]>;
}) {
  return {
    userRoleAssignment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const roleFilter = where.role as { in: string[] };
        return (options.falakRoles ?? [])
          .filter((r) => !r.revoked && roleFilter.in.includes(r.role))
          .map((r) => ({ role: r.role }));
      },
    },
    company: {
      findMany: async ({ where }: { where?: { id?: { in: string[] } } } = {}) =>
        options.companies
          .filter((c) => !c.archivedAt)
          .filter((c) => !where?.id || where.id.in.includes(c.id))
          .map((c) => ({
            id: c.id,
            slug: c.slug,
            nameEn: c.nameEn,
            nameAr: c.nameAr,
            currency: c.currency,
            cycles: c.cycles.map((cy) => ({
              periodLabel: cy.periodLabel,
              periodStart: cy.periodStart,
              templateId: cy.templateId,
              submission:
                cy.submissionId === null
                  ? null
                  : {
                      id: cy.submissionId,
                      metricValues: (cy.revenueMetricValues ?? []).map((v) => ({
                        metricDefinition: { key: v.key },
                        numericValue: v.value === null ? null : { toNumber: () => v.value },
                        isNa: v.isNa ?? false,
                      })),
                    },
            })),
          })),
    },
    ...makeMetricLookupModels(options.metricsBySubmissionId ?? {}),
  };
}

/** Backs getVehicleNavSummary (src/lib/vehicle/nav.ts). */
export function makeVehicleNavDbStub(options: {
  falakRoles?: FalakRoleFixture[];
  snapshots?: { vehicleId: string; asOfDate: Date; navAmount: number; currency: string }[];
}) {
  const snapshots = options.snapshots ?? [];
  return {
    userRoleAssignment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const roleFilter = where.role as { in: string[] };
        return (options.falakRoles ?? [])
          .filter((r) => !r.revoked && roleFilter.in.includes(r.role))
          .map((r) => ({ role: r.role }));
      },
    },
    vehicleNavSnapshot: {
      findMany: async ({ where }: { where: { vehicleId: string } }) =>
        snapshots
          .filter((s) => s.vehicleId === where.vehicleId)
          .sort((a, b) => a.asOfDate.getTime() - b.asOfDate.getTime())
          .map((s) => ({ asOfDate: s.asOfDate, navAmount: { toNumber: () => s.navAmount }, currency: s.currency })),
    },
  };
}

/** Backs getVehicleCapitalOverview (src/lib/vehicle/cap-table.ts). */
export function makeVehicleCapTableDbStub(options: {
  falakRoles?: FalakRoleFixture[];
  agreements?: { vehicleId: string; investedAmount: number | null; currency: string | null }[];
  positions?: {
    vehicleId: string;
    investor: { id: string; nameEn: string; nameAr: string };
    commitmentAmount: number | null;
    ownershipPct: number | null;
    currency: string;
  }[];
  fees?: { vehicleId: string; investorId: string; amount: number; currency: string }[];
}) {
  const dec = (v: number | null) => (v === null ? null : { toNumber: () => v });
  return {
    userRoleAssignment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const roleFilter = where.role as { in: string[] };
        return (options.falakRoles ?? [])
          .filter((r) => !r.revoked && roleFilter.in.includes(r.role))
          .map((r) => ({ role: r.role }));
      },
    },
    investmentAgreement: {
      findMany: async ({ where }: { where: { ownershipPosition: { vehicleId: string } } }) =>
        (options.agreements ?? [])
          .filter((a) => a.vehicleId === where.ownershipPosition.vehicleId)
          .map((a) => ({ investedAmount: dec(a.investedAmount), currency: a.currency })),
    },
    investorVehiclePosition: {
      findMany: async ({ where }: { where: { vehicleId: string } }) =>
        (options.positions ?? [])
          .filter((p) => p.vehicleId === where.vehicleId)
          .map((p) => ({
            commitmentAmount: dec(p.commitmentAmount),
            ownershipPct: dec(p.ownershipPct),
            currency: p.currency,
            investor: p.investor,
          })),
    },
    investorCapitalTransaction: {
      findMany: async ({ where }: { where: { vehicleId: string } }) =>
        (options.fees ?? [])
          .filter((f) => f.vehicleId === where.vehicleId)
          .map((f) => ({ investorId: f.investorId, amount: dec(f.amount)!, currency: f.currency })),
    },
  };
}
