import "server-only";
import { db } from "@/lib/db";
import type { Prisma, NarrativeKind } from "@/generated/prisma/client";
import { requireFalakRole } from "@/lib/auth/authorization";
import { InvalidTransitionError } from "@/lib/reporting/submission-errors";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import { sendReportPublishedEmail } from "@/lib/email/send-email";

export interface NarrativeInput {
  textEn: string;
  textAr: string;
}

export type NarrativeInputs = Partial<Record<NarrativeKind, NarrativeInput>>;

const NARRATIVE_KINDS: NarrativeKind[] = [
  "operational_update",
  "quarter_highlights",
  "investment_review_notes",
  "management_commentary",
];

/**
 * Every investor with real exposure to companyId, via either path the
 * schema actually models -- confirmed against the real field shapes, not
 * assumed:
 *   - Vehicle-mediated: OwnershipPosition (holderType VEHICLE) has no
 *     investor FK at all -- reaching investors on this path requires a
 *     second query into InvestorVehiclePosition (status "Active") keyed
 *     by vehicleId.
 *   - Direct: OwnershipPosition (holderType DIRECT_INVESTOR) carries
 *     investorId directly.
 * holderType DIRECT_FALAK rows are Falak's own stake and never produce
 * investor access. Returns distinct, non-archived investor ids only.
 */
async function resolveInvestorExposure(tx: Prisma.TransactionClient, companyId: string): Promise<string[]> {
  const [vehiclePositions, directPositions] = await Promise.all([
    tx.ownershipPosition.findMany({
      where: { companyId, holderType: "VEHICLE" },
      select: { vehicleId: true },
    }),
    tx.ownershipPosition.findMany({
      where: { companyId, holderType: "DIRECT_INVESTOR" },
      select: { investorId: true },
    }),
  ]);

  const vehicleIds = vehiclePositions.map((p) => p.vehicleId).filter((v): v is string => v !== null);
  const directInvestorIds = directPositions.map((p) => p.investorId).filter((v): v is string => v !== null);

  // A vehicle investor is exposed to this startup when their position
  // covers all the vehicle's startups, or they hold an active
  // startup-level exposure to it (deal-by-deal positions).
  const vehicleInvestorPositions = vehicleIds.length
    ? await tx.investorVehiclePosition.findMany({
        where: {
          vehicleId: { in: vehicleIds },
          status: "Active",
          OR: [{ exposureScope: "ALL_STARTUPS" }, { startupExposures: { some: { companyId, status: "Active" } } }],
        },
        select: { investorId: true },
        distinct: ["investorId"],
      })
    : [];

  const candidateIds = [...new Set([...vehicleInvestorPositions.map((p) => p.investorId), ...directInvestorIds])];
  if (candidateIds.length === 0) return [];

  const activeInvestors = await tx.investor.findMany({
    where: { id: { in: candidateIds }, archivedAt: null },
    select: { id: true },
  });
  return activeInvestors.map((i) => i.id);
}

/**
 * Publishes an approved CompanySubmission: find-or-creates the
 * COMPANY-scope Report for its (companyId, periodStart, periodEnd) --
 * matching the real duplicate-report-prevention partial unique index,
 * which Prisma's schema can't express as a @@unique (NULL != NULL across
 * the nullable scope FKs) -- supersedes any existing version, creates the
 * new one, attaches this one submission, creates whichever narrative
 * sections have real text, and grants access to every investor currently
 * exposed to this company. Only legal from "approved"; never changes the
 * CompanySubmission's own status (there is no "published" value for it --
 * publishing is an act on Report/ReportVersion, not the submission).
 */
export interface PublishNotification {
  reportDistributionId: string;
  recipientEmail: string;
}

export interface PublishResult {
  reportId: string;
  versionNo: number;
  companySlug: string;
  companyNameEn: string;
  periodLabel: string;
  // One row per (granted investor, that investor's active member) -- the
  // caller sends the actual email AFTER this transaction commits (see
  // this function's own comment on why), then flips each
  // ReportDistribution's status/sentAt by this id.
  notifications: PublishNotification[];
}

export async function publishSubmission(submissionId: string, narratives: NarrativeInputs): Promise<PublishResult> {
  const { user } = await requireFalakRole("FALAK_ADMIN");

  return db.$transaction(async (tx) => {
    const submission = await tx.companySubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        status: true,
        cycle: {
          select: {
            companyId: true,
            periodLabel: true,
            periodStart: true,
            periodEnd: true,
            company: { select: { archivedAt: true, slug: true, nameEn: true } },
          },
        },
      },
    });

    if (!submission || submission.status !== "approved" || submission.cycle.company.archivedAt) {
      throw new InvalidTransitionError();
    }

    const { companyId, periodLabel, periodStart, periodEnd } = submission.cycle;

    let report = await tx.report.findFirst({
      where: { scope: "COMPANY", companyId, periodStart, periodEnd },
    });
    if (!report) {
      report = await tx.report.create({
        data: { scope: "COMPANY", companyId, periodLabel, periodStart, periodEnd, asOfDate: periodEnd, status: "published" },
      });
    } else {
      await tx.report.update({ where: { id: report.id }, data: { status: "published" } });
    }

    await tx.reportVersion.updateMany({
      where: { reportId: report.id, isSuperseded: false },
      data: { isSuperseded: true },
    });

    const priorVersionCount = await tx.reportVersion.count({ where: { reportId: report.id } });
    const version = await tx.reportVersion.create({
      data: {
        reportId: report.id,
        versionNo: priorVersionCount + 1,
        isSuperseded: false,
        publishedAt: new Date(),
        createdById: user.id,
      },
    });

    await tx.reportVersionSubmission.create({
      data: { reportVersionId: version.id, submissionId },
    });

    for (const kind of NARRATIVE_KINDS) {
      const input = narratives[kind];
      if (!input) continue;
      const textEn = input.textEn.trim();
      const textAr = input.textAr.trim();
      if (!textEn && !textAr) continue;
      await tx.narrativeSection.create({
        data: { reportVersionId: version.id, kind, textEn, textAr, authorId: user.id },
      });
    }

    const investorIds = await resolveInvestorExposure(tx, companyId);
    const notifications: PublishNotification[] = [];
    for (const investorId of investorIds) {
      await tx.reportAccessGrant.create({ data: { reportVersionId: version.id, investorId } });

      // One ReportDistribution + one notification per active member of
      // this investor org, mirroring the same "every member, not just an
      // org-level contact" choice reminders.ts makes for company members
      // -- there is no single "primary contact" field on Investor/Company
      // in this schema, so the whole active membership is the recipient
      // list. The actual email send happens after this transaction
      // commits (see publishSubmissionAction) -- this only reserves the
      // delivery records.
      const activeMembers = await tx.investorMembership.findMany({
        where: { investorId, revokedAt: null },
        select: { user: { select: { email: true } } },
      });
      for (const member of activeMembers) {
        const distribution = await tx.reportDistribution.create({
          data: {
            reportVersionId: version.id,
            investorId,
            recipientEmail: member.user.email,
            channel: "Email",
            status: "Pending",
          },
        });
        notifications.push({ reportDistributionId: distribution.id, recipientEmail: member.user.email });
      }
    }

    await writeAuditEvent(tx, {
      actorId: user.id,
      action: "report.published",
      targetType: "ReportVersion",
      targetId: version.id,
    });

    return {
      reportId: report.id,
      versionNo: version.versionNo,
      companySlug: submission.cycle.company.slug,
      companyNameEn: submission.cycle.company.nameEn,
      periodLabel,
      notifications,
    };
  });
}

/**
 * Sends the actual "report published" emails and flips each
 * ReportDistribution's status -- deliberately called AFTER
 * publishSubmission's transaction has committed, never from inside it,
 * since a slow/failed email provider call must never hold open or roll
 * back the publish transaction itself. A single recipient's send failure
 * is recorded on their own ReportDistribution row (status Failed +
 * failureReason) and does not affect any other recipient or the
 * already-successful publish -- this function never throws.
 */
export async function sendPublishNotifications(result: PublishResult): Promise<void> {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) return;

  const reportUrl = `${baseUrl}/company/${result.companySlug}/report?period=${encodeURIComponent(result.periodLabel)}`;

  for (const notification of result.notifications) {
    try {
      await sendReportPublishedEmail(notification.recipientEmail, result.companyNameEn, result.periodLabel, reportUrl);
      await db.reportDistribution.update({
        where: { id: notification.reportDistributionId },
        data: { status: "Sent", sentAt: new Date() },
      });
    } catch (error) {
      await db.reportDistribution.update({
        where: { id: notification.reportDistributionId },
        data: { status: "Failed", failureReason: error instanceof Error ? error.message : "Unknown error" },
      });
    }
  }
}

/**
 * Manually re-syncs and re-sends an already-published ReportVersion's
 * investor distribution: re-resolves current investor exposure (so an
 * investor who joined a vehicle, or took a new direct stake, AFTER the
 * original publish still gets a grant + a send), then (re-)sends to
 * every recipient whose own distribution isn't already Sent -- a
 * Pending row (the original send never got attempted/completed for
 * some reason) or a Failed one both get retried; an already-Sent row
 * is left alone, so this never spams someone who already received it.
 * Unlike sendPublishNotifications (fire-and-forget after a fresh
 * publish), this is itself the explicit, on-demand action, so it does
 * throw on auth/not-found -- the caller (resendReportToInvestorsAction)
 * surfaces that as a real error, not a silently-swallowed one.
 */
export async function resendReportToInvestors(reportVersionId: string): Promise<void> {
  const { user } = await requireFalakRole("FALAK_ADMIN");

  const version = await db.reportVersion.findUnique({
    where: { id: reportVersionId },
    select: {
      id: true,
      report: { select: { companyId: true, periodLabel: true, company: { select: { slug: true, nameEn: true } } } },
    },
  });
  if (!version || !version.report.companyId || !version.report.company) {
    throw new InvalidTransitionError();
  }
  const { companyId, periodLabel, company } = version.report;

  const investorIds = await db.$transaction(async (tx) => {
    const ids = await resolveInvestorExposure(tx, companyId);
    for (const investorId of ids) {
      await tx.reportAccessGrant.upsert({
        where: { reportVersionId_investorId: { reportVersionId, investorId } },
        update: {},
        create: { reportVersionId, investorId },
      });
    }
    await writeAuditEvent(tx, {
      actorId: user.id,
      action: "report.resent_to_investors",
      targetType: "ReportVersion",
      targetId: reportVersionId,
    });
    return ids;
  });

  const notifications: PublishNotification[] = [];
  for (const investorId of investorIds) {
    const activeMembers = await db.investorMembership.findMany({
      where: { investorId, revokedAt: null },
      select: { user: { select: { email: true } } },
    });
    for (const member of activeMembers) {
      const existing = await db.reportDistribution.findFirst({
        where: { reportVersionId, investorId, recipientEmail: member.user.email },
        orderBy: { createdAt: "desc" },
      });
      if (existing && existing.status === "Sent") continue;

      const distribution = existing
        ? await db.reportDistribution.update({ where: { id: existing.id }, data: { status: "Pending", failureReason: null } })
        : await db.reportDistribution.create({
            data: { reportVersionId, investorId, recipientEmail: member.user.email, channel: "Email", status: "Pending" },
          });
      notifications.push({ reportDistributionId: distribution.id, recipientEmail: member.user.email });
    }
  }

  // reportId/versionNo aren't used by sendPublishNotifications itself
  // (it only reads companySlug/companyNameEn/periodLabel/notifications)
  // -- left blank here rather than fetching them just to satisfy the
  // shared PublishResult shape.
  await sendPublishNotifications({ reportId: "", versionNo: 0, companySlug: company.slug, companyNameEn: company.nameEn, periodLabel, notifications });
}
