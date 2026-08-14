import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { BorrowerDirectory } from "@/components/crm/BorrowerDirectory";
import { CrmOperationsPanel } from "@/components/crm/CrmOperationsPanel";
import { loadAccessContext } from "@/lib/auth/session";
import { readFoundationStatus, writesEnabledForOrganization } from "@/lib/config/foundation-status";
import { deriveBorrowerDirectory, filterBorrowerDirectory } from "@/lib/los/read-model";
import { loadBorrowerDirectory, loadCommandCenterDeals, loadCrmActivities } from "@/lib/los/queries";

export const dynamic = "force-dynamic";
export default async function CrmPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string; error?: string; saved?: string }> }) {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind !== "ready") redirect("/app");
  const readsEnabled = readFoundationStatus().readsEnabled;
  const { q = "", view = "home", error, saved } = await searchParams;
  const [borrowers, deals, activities] = readsEnabled ? await Promise.all([loadBorrowerDirectory(context), loadCommandCenterDeals(context), loadCrmActivities(context)]) : [[], [], []];
  const rows = filterBorrowerDirectory(deriveBorrowerDirectory(borrowers, deals), q);
  return <AppShell context={context} surface="crm">{readsEnabled ? <><BorrowerDirectory rows={rows} query={q} view={view} /><CrmOperationsPanel rows={rows} activities={activities} writesEnabled={writesEnabledForOrganization(context.activeOrganization.organizationId)} error={error} saved={saved} /></> : <ReadsPending />}</AppShell>;
}
function ReadsPending() { return <section className="workspace-placeholder"><p className="eyebrow">Installed default-off</p><h2>Borrower CRM reads are awaiting activation.</h2><p>The directory is implemented, but no relationship records load until the existing tenant-scoped read gate is enabled.</p></section>; }
