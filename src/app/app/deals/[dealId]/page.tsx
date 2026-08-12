import { notFound, redirect } from "next/navigation";
import { loadAccessContext } from "@/lib/auth/session";
import { readFoundationStatus } from "@/lib/config/foundation-status";
import { loadDealDetail, loadUnderwritingWorkspace } from "@/lib/los/queries";
import { AppShell } from "@/components/app/AppShell";
import { DealCockpit } from "@/components/deals/DealCockpit";

export const dynamic = "force-dynamic";
export default async function DealPage({ params, searchParams }: { params: Promise<{ dealId: string }>; searchParams: Promise<{ underwriting?: string }> }) {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind !== "ready" || !readFoundationStatus().readsEnabled) notFound();
  const { dealId } = await params;
  const [deal, underwriting] = await Promise.all([
    loadDealDetail(context, dealId),
    loadUnderwritingWorkspace(context, dealId),
  ]);
  if (!deal) notFound();
  const downloadsEnabled = process.env.BUDDY_DOCUMENT_DOWNLOADS_ENABLED === "true";
  const uploadsEnabled = process.env.BUDDY_DOCUMENT_UPLOADS_ENABLED === "true";
  const outcome = (await searchParams).underwriting;
  return <AppShell context={context}><DealCockpit deal={deal} downloadsEnabled={downloadsEnabled} uploadsEnabled={uploadsEnabled} underwriting={underwriting} runtimeEnabled={process.env.BUDDY_UNDERWRITER_RUNTIME_ENABLED === "true"} underwritingOutcome={outcome} role={context.activeOrganization.role} /></AppShell>;
}
