import type { Metadata } from "next";
import { getFormLinkView } from "@/lib/reporting/form-link";
import { FormLinkClient } from "./FormLinkClient";

export const metadata: Metadata = {
  title: "Report form",
  // A private, per-recipient link: keep it out of search engines.
  robots: { index: false, follow: false },
};

// Opened from an emailed link: no sign-in, the token is the key.
export default async function FormLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getFormLinkView(token);
  return <FormLinkClient token={token} view={view} />;
}
