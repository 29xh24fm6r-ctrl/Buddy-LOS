import { notFound, redirect } from "next/navigation";
import { loadAccessContext } from "@/lib/auth/session";
import { defaultWorkspaceSurface } from "@/lib/workspace-surfaces";
import { documentsEnabledForOrganization, readFoundationStatus, writesEnabledForOrganization } from "@/lib/config/foundation-status";
import { loadDealDetail, loadDealTasks, loadGoldenLoanWorkspace, loadUnderwritingWorkspace } from "@/lib/los/queries";
import { AppShell } from "@/components/app/AppShell";
import { DealCockpit } from "@/components/deals/DealCockpit";
import { CoreDealOperations } from "@/components/deals/CoreDealOperations";

export const dynamic = "force-dynamic";
export default async function DealPage({ params, searchParams }: { params: Promise<{ dealId: string }>; searchParams: Promise<{ underwriting?: string; error?: string; saved?: string }> }) {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind !== "ready" || !readFoundationStatus().readsEnabled) notFound();
  const { dealId } = await params;
  const [deal, underwriting, tasks, lifecycle] = await Promise.all([
    loadDealDetail(context, dealId),
    loadUnderwritingWorkspace(context, dealId),
    loadDealTasks(context, dealId),
    loadGoldenLoanWorkspace(context, dealId),
  ]);
  if (!deal) notFound();
  const documentsEnabled = documentsEnabledForOrganization(context.activeOrganization.organizationId);
  const downloadsEnabled = documentsEnabled && process.env.BUDDY_DOCUMENT_DOWNLOADS_ENABLED === "true";
  const uploadsEnabled = documentsEnabled && process.env.BUDDY_DOCUMENT_UPLOADS_ENABLED === "true";
  const query = await searchParams;
  const factoryEnabled=process.env.BUDDY_GOLDEN_LOAN_FACTORY_ENABLED==="true"&&(process.env.BUDDY_GOLDEN_LOAN_FACTORY_ORGANIZATION_IDS??"").split(",").map(x=>x.trim()).includes(context.activeOrganization.organizationId);
  return <AppShell context={context} surface={defaultWorkspaceSurface(context.workspace)}><DealCockpit deal={deal} downloadsEnabled={downloadsEnabled} uploadsEnabled={uploadsEnabled} underwriting={underwriting} runtimeEnabled={process.env.BUDDY_UNDERWRITER_RUNTIME_ENABLED === "true"} underwritingOutcome={query.underwriting} role={context.activeOrganization.role} lifecycle={lifecycle} factoryEnabled={factoryEnabled} /><CoreDealOperations dealId={deal.id} version={deal.version} stage={deal.stage} tasks={tasks} writesEnabled={writesEnabledForOrganization(context.activeOrganization.organizationId)} error={query.error} saved={query.saved}/></AppShell>;
}
