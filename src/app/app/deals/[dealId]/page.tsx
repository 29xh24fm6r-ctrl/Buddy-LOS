import { notFound, redirect } from "next/navigation";
import { loadAccessContext } from "@/lib/auth/session";
import { readFoundationStatus } from "@/lib/config/foundation-status";
import { loadDealDetail } from "@/lib/los/queries";
import { AppHeader, AppShell } from "@/components/app/AppShell";
import { DealCockpit } from "@/components/deals/DealCockpit";

export const dynamic = "force-dynamic";
export default async function DealPage({ params }: { params: Promise<{ dealId: string }> }) {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind !== "ready" || !readFoundationStatus().readsEnabled) notFound();
  const { dealId } = await params;
  const deal = await loadDealDetail(context, dealId);
  if (!deal) notFound();
  const downloadsEnabled = process.env.BUDDY_DOCUMENT_DOWNLOADS_ENABLED === "true";
  return <AppShell context={context}><AppHeader context={context} eyebrow="Loan workflow" title={deal.name} /><DealCockpit deal={deal} downloadsEnabled={downloadsEnabled} /></AppShell>;
}
