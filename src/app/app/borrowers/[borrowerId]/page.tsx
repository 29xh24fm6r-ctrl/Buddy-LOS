import { notFound, redirect } from "next/navigation";
import { loadAccessContext } from "@/lib/auth/session";
import { readFoundationStatus } from "@/lib/config/foundation-status";
import { loadBorrowerDetail } from "@/lib/los/queries";
import { AppHeader, AppShell } from "@/components/app/AppShell";
import { BorrowerRelationshipSummary } from "@/components/crm/BorrowerRelationshipSummary";

export const dynamic = "force-dynamic";
export default async function BorrowerPage({ params }: { params: Promise<{ borrowerId: string }> }) {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind !== "ready" || !readFoundationStatus().readsEnabled) notFound();
  const { borrowerId } = await params;
  const borrower = await loadBorrowerDetail(context, borrowerId);
  if (!borrower) notFound();
  return <AppShell context={context}><AppHeader context={context} eyebrow="Borrower CRM" title={borrower.legalName} /><BorrowerRelationshipSummary borrower={borrower} /></AppShell>;
}
