import { redirect } from "next/navigation";
import { AppHeader, AppShell } from "@/components/app/AppShell";
import { DealPipeline } from "@/components/deals/DealPipeline";
import { loadAccessContext } from "@/lib/auth/session";
import { readFoundationStatus } from "@/lib/config/foundation-status";
import { filterDealPipeline } from "@/lib/los/read-model";
import { loadCommandCenterDeals } from "@/lib/los/queries";

export const dynamic = "force-dynamic";
export default async function DealsPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string }> }) {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind !== "ready") redirect("/app");
  const readsEnabled = readFoundationStatus().readsEnabled;
  const { q = "", stage = "" } = await searchParams;
  const deals = readsEnabled ? filterDealPipeline(await loadCommandCenterDeals(context), q, stage) : [];
  return <AppShell context={context}><AppHeader context={context} eyebrow="Deal Workspace" title="Active pipeline" />{readsEnabled ? <DealPipeline deals={deals} query={q} stage={stage} /> : <ReadsPending />}</AppShell>;
}
function ReadsPending() { return <section className="workspace-placeholder"><p className="eyebrow">Installed default-off</p><h2>Deal pipeline reads are awaiting activation.</h2><p>The pipeline is implemented, but no deal records load until the existing tenant-scoped read gate is enabled.</p></section>; }
