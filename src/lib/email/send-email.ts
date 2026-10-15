import "server-only";
import { Resend } from "resend";

// Outbound email goes through deliver() below: Mailgun when MAILGUN_SECRET
// and MAILGUN_DOMAIN are set, otherwise Resend (RESEND_API_KEY).
//
// Sender: MAIL_FROM_NAME + MAIL_FROM_ADDRESS (e.g. Angel Space <info@falak.sa>),
// else EMAIL_FROM, else the platform default. Replies go to the sender
// address. Its domain must be one the provider is set up to send for.
function fromAddress(): { from: string; replyTo: string | null } {
  const address = process.env.MAIL_FROM_ADDRESS?.trim();
  if (address) {
    const name = process.env.MAIL_FROM_NAME?.trim().replace(/^"|"$/g, "");
    return { from: name ? `${name} <${address}>` : address, replyTo: address };
  }
  return { from: process.env.EMAIL_FROM?.trim() || "Falak Portfolio Platform <noreply@falakinvestments.space>", replyTo: null };
}

interface Message {
  to: string;
  /** Copied in (e.g. the startup's investment professionals). */
  cc?: string[];
  subject: string;
  html: string;
  text: string;
}

let resendClient: Resend | null = null;

async function deliver(message: Message, what: string): Promise<void> {
  const { from, replyTo } = fromAddress();
  const mailgunKey = process.env.MAILGUN_SECRET?.trim();
  const mailgunDomain = process.env.MAILGUN_DOMAIN?.trim();

  if (mailgunKey && mailgunDomain) {
    const endpoint = process.env.MAILGUN_ENDPOINT?.trim() || "api.mailgun.net";
    const body = new URLSearchParams({ from, to: message.to, subject: message.subject, html: message.html, text: message.text });
    if (replyTo) body.set("h:Reply-To", replyTo);
    if (message.cc?.length) body.set("cc", message.cc.join(","));
    const response = await fetch(`https://${endpoint}/v3/${encodeURIComponent(mailgunDomain)}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`api:${mailgunKey}`).toString("base64")}` },
      body,
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`Failed to send ${what} email: Mailgun ${response.status} ${detail}`);
    }
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("No email provider is configured (set MAILGUN_SECRET and MAILGUN_DOMAIN, or RESEND_API_KEY).");
  }
  resendClient ??= new Resend(apiKey);
  const { error } = await resendClient.emails.send({ from, to: message.to, subject: message.subject, html: message.html, text: message.text, ...(message.cc?.length ? { cc: message.cc } : {}), ...(replyTo ? { replyTo } : {}) });
  if (error) {
    throw new Error(`Failed to send ${what} email: ${error.message}`);
  }
}

/**
 * The one real network I/O boundary for outbound email in this app --
 * every caller goes through this exact function, so it's the single place
 * tests/support/mock-loader.mjs needs to stub to keep the whole test suite
 * network-free. Never throws for the caller to catch-and-hide: a failed
 * send should surface as a real error, since request-sign-in.ts's
 * enumeration-safety guarantee is about the RESPONSE shape, not about
 * silently swallowing a genuine delivery failure.
 */
export async function sendSignInEmail(to: string, verifyUrl: string): Promise<void> {
  await deliver(
    {
      to,
      subject: "Sign in to Falak Portfolio Platform",
      html: `<p>Click the link below to sign in. This link expires in 15 minutes and can only be used once.</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
      text: `Click the link below to sign in. This link expires in 15 minutes and can only be used once.\n\n${verifyUrl}`,
    },
    "sign-in"
  );
}

/**
 * Deliberately separate from sendSignInEmail (different subject/copy,
 * and a different underlying token family -- see PasswordResetToken's
 * own schema comment on why reset and sign-in links are never the same
 * token type) even though the HTML shape is near-identical.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await deliver(
    {
      to,
      subject: "Reset your Falak Portfolio Platform password",
      html: `<p>Click the link below to set a new password. This link expires in 30 minutes and can only be used once.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
      text: `Click the link below to set a new password. This link expires in 30 minutes and can only be used once.\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
    },
    "password reset"
  );
}

/**
 * Sent once, right after an admin approves an AccessRequest -- same
 * network I/O boundary and never-swallow-a-real-failure discipline as
 * sendSignInEmail above. Points at /sign-in rather than carrying a token
 * itself: approval only grants access, it does not authenticate the
 * person, so they still go through the normal passwordless sign-in flow.
 */
export async function sendAccessApprovedEmail(to: string): Promise<void> {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    throw new Error("APP_BASE_URL is not set.");
  }
  const signInUrl = `${baseUrl}/sign-in`;
  await deliver(
    {
      to,
      subject: "Your Falak Portfolio Platform access has been approved",
      html: `<p>Your access request has been approved. Sign in below to get started.</p><p><a href="${signInUrl}">${signInUrl}</a></p>`,
      text: `Your access request has been approved. Sign in to get started.\n\n${signInUrl}`,
    },
    "access-approved"
  );
}

/**
 * Sent by the daily reminder sweep (src/lib/reporting/reminders.ts) to a
 * company member while a reporting deadline is still upcoming. Same
 * network I/O boundary and never-swallow-a-real-failure discipline as
 * every other function here.
 */
export async function sendDeadlineReminderEmail(
  to: string,
  companyName: string,
  periodLabel: string,
  deadline: string,
  formUrl: string,
  cc: string[] = []
): Promise<void> {
  await deliver(
    {
      to,
      cc,
      subject: `Reminder: ${periodLabel} report due ${deadline} -- ${companyName}`,
      html: `<p>Your ${escapeHtml(periodLabel)} report for ${escapeHtml(companyName)} is due on ${escapeHtml(deadline)}.</p><p>${LINK_ACTION}</p><p><a href="${escapeHtml(formUrl)}">${escapeHtml(formUrl)}</a></p>`,
      text: `Your ${periodLabel} report for ${companyName} is due on ${deadline}.\n\n${LINK_ACTION}\n\n${formUrl}`,
    },
    "deadline-reminder"
  );
}

// Every link in a startup's report emails opens the form directly.
const LINK_ACTION =
  "Open the link below to fill in and submit the report. No account is needed. Anyone with this link can submit the report, so please keep it within your team.";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Sent when Falak requests a report from a startup. `isInvite` means the
 * recipient has no login yet: the link is an invitation that creates
 * their access and leads to the reporting form.
 */
export async function sendReportRequestEmail(
  to: string,
  details: { companyName: string; periodLabel: string; deadline: string; url: string; cc?: string[] }
): Promise<void> {
  const { companyName, periodLabel, deadline, url } = details;
  const action = LINK_ACTION;
  await deliver(
    {
      to,
      cc: details.cc,
      subject: `Falak report request: ${periodLabel} -- ${companyName}`,
      html: `<p>Falak Ventures has requested the ${escapeHtml(periodLabel)} report for ${escapeHtml(companyName)}, due on ${escapeHtml(deadline)}.</p><p>${action}</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
      text: `Falak Ventures has requested the ${periodLabel} report for ${companyName}, due on ${deadline}.\n\n${action}\n\n${url}`,
    },
    "report-request"
  );
}

/**
 * Sent when Falak reviews a submitted report and sends it back for changes:
 * the reviewer's comment plus a fresh link to the form, which is open for
 * editing again.
 */
export async function sendChangesRequestedEmail(
  to: string,
  details: { companyName: string; periodLabel: string; deadline: string; comment: string; url: string; cc?: string[] }
): Promise<void> {
  const { companyName, periodLabel, deadline, comment, url } = details;
  const intro = `Falak Ventures has reviewed the ${periodLabel} report for ${companyName} and asked for some changes.`;
  const outro = "Open the link below to update and resubmit the report. No account is needed. Anyone with this link can submit the report, so please keep it within your team.";
  await deliver(
    {
      to,
      cc: details.cc,
      subject: `Changes requested: ${periodLabel} report -- ${companyName}`,
      html: `<p>${escapeHtml(intro)}</p><p><strong>Reviewer's comment:</strong></p><blockquote style="margin:0 0 1em;padding-left:12px;border-left:3px solid #ccc;white-space:pre-wrap">${escapeHtml(comment)}</blockquote><p>${outro} The report is due on ${escapeHtml(deadline)}.</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
      text: `${intro}\n\nReviewer's comment:\n${comment}\n\n${outro} The report is due on ${deadline}.\n\n${url}`,
    },
    "changes-requested"
  );
}

/**
 * Sent once a reporting deadline has already passed without a submission.
 * Distinct subject/tone from the upcoming reminder so an inbox can tell
 * the two apart at a glance.
 */
export async function sendOverdueReminderEmail(
  to: string,
  companyName: string,
  periodLabel: string,
  deadline: string,
  formUrl: string,
  cc: string[] = []
): Promise<void> {
  await deliver(
    {
      to,
      cc,
      subject: `Overdue: ${periodLabel} report -- ${companyName}`,
      html: `<p>The ${escapeHtml(periodLabel)} report for ${escapeHtml(companyName)} was due on ${escapeHtml(deadline)} and has not yet been submitted.</p><p>${LINK_ACTION}</p><p><a href="${escapeHtml(formUrl)}">${escapeHtml(formUrl)}</a></p>`,
      text: `The ${periodLabel} report for ${companyName} was due on ${deadline} and has not yet been submitted.\n\n${LINK_ACTION}\n\n${formUrl}`,
    },
    "overdue-reminder"
  );
}

/**
 * Sent to an investor once a company's report is published and they've
 * been granted access to it -- fired from the review action AFTER
 * publishSubmission's transaction commits, never from inside it (see
 * publish-workflow.ts's own comment on why).
 */
export async function sendReportPublishedEmail(
  to: string,
  companyName: string,
  periodLabel: string,
  reportUrl: string
): Promise<void> {
  await deliver(
    {
      to,
      subject: `New report available: ${companyName} -- ${periodLabel}`,
      html: `<p>A new ${periodLabel} report for ${companyName} has been published and is available for you to view.</p><p><a href="${reportUrl}">${reportUrl}</a></p>`,
      text: `A new ${periodLabel} report for ${companyName} has been published and is available for you to view.\n\n${reportUrl}`,
    },
    "report-published"
  );
}
