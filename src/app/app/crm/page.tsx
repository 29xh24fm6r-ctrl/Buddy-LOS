import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { BorrowerDirectory } from "@/components/crm/BorrowerDirectory";
import { CrmOperationsPanel } from "@/components/crm/CrmOperationsPanel";
import { loadAccessContext } from "@/lib/auth/session";
import { readFoundationStatus, writesEnabledForOrganization } from "@/lib/config/foundation-status";
import { deriveBorrowerDirectory, filterBorrowerDirectory } from "@/lib/los/read-model";
import { canOperateCore } from "@/lib/los/core-operations";
import { loadBorrowerDirectory, loadCommandCenterDeals, loadCrmActivities, loadCrmContacts, loadCrmRelationships, loadDealTasks } from "@/lib/los/queries";

export const dynamic = "force-dynamic";
export default async function CrmPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string; error?: string; saved?: string }> }) {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind !== "ready") redirect("/app");
  const readsEnabled = readFoundationStatus().readsEnabled;
  const { q = "", view = "home", error, saved } = await searchParams;
  const [borrowers, deals, activities, contacts, relationships, tasks] = readsEnabled ? await Promise.all([loadBorrowerDirectory(context), loadCommandCenterDeals(context), loadCrmActivities(context), loadCrmContacts(context), loadCrmRelationships(context), loadDealTasks(context)]) : [[], [], [], [], [], []];
  const allRows = deriveBorrowerDirectory(borrowers, deals), rows = filterBorrowerDirectory(allRows, q);
  const timezone=context.activeOrganization.timezone;
  const writesEnabled=writesEnabledForOrganization(context.activeOrganization.organizationId)&&canOperateCore(context.activeOrganization.role);
  return <AppShell context={context} surface="crm">{readsEnabled ? <><BorrowerDirectory rows={rows} contacts={contacts} relationships={relationships} deals={deals} activities={activities} tasks={tasks} query={q} view={view} timezone={timezone}/><CrmOperationsPanel rows={allRows} deals={deals} activities={activities} tasks={tasks} timezone={timezone} writesEnabled={writesEnabled} error={error} saved={saved} /></> : <ReadsPending />}</AppShell>;
}
function ReadsPending() { return <section className="workspace-placeholder"><p className="eyebrow">Installed default-off</p><h2>Borrower CRM reads are awaiting activation.</h2><p>The directory is implemented, but no relationship records load until the existing tenant-scoped read gate is enabled.</p></section>; }
