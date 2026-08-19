import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { BorrowerDirectory } from "@/components/crm/BorrowerDirectory";
import { CrmOperationsPanel } from "@/components/crm/CrmOperationsPanel";
import { loadAccessContext } from "@/lib/auth/session";
import { readFoundationStatus, writesEnabledForOrganization } from "@/lib/config/foundation-status";
import { deriveBorrowerDirectory, filterBorrowerDirectory } from "@/lib/los/read-model";
import { canOperateCore } from "@/lib/los/core-operations";
import { loadBorrowerDirectory, loadCommandCenterDeals, loadCrmActivities, loadCrmAppointments, loadCrmContacts, loadCrmMetrics, loadCrmPeople, loadCrmReferrals, loadCrmRelationships, loadDealTasks } from "@/lib/los/queries";

export const dynamic = "force-dynamic";
export default async function CrmPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string; page?: string; error?: string; saved?: string }> }) {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind !== "ready") redirect("/app");
  const readsEnabled = readFoundationStatus().readsEnabled;
  const { q = "", view = "home", page:rawPage, error, saved } = await searchParams;
  const page=Math.max(1,Number.parseInt(rawPage??"1",10)||1);
  const [borrowers, deals, activities, contacts, relationships, tasks, people, referrals, appointments, metrics] = readsEnabled ? await Promise.all([loadBorrowerDirectory(context,page), loadCommandCenterDeals(context,page), loadCrmActivities(context,page), loadCrmContacts(context,page), loadCrmRelationships(context,page), loadDealTasks(context,undefined,page), loadCrmPeople(context,page), loadCrmReferrals(context,page), loadCrmAppointments(context,page), loadCrmMetrics(context)]) : [[], [], [], [], [], [], [], [], [], null];
  const allRows = deriveBorrowerDirectory(borrowers, deals), rows = filterBorrowerDirectory(allRows, q);
  const timezone=context.activeOrganization.timezone;
  const writesEnabled=writesEnabledForOrganization(context.activeOrganization.organizationId)&&canOperateCore(context.activeOrganization.role);
  return <AppShell context={context} surface="crm">{readsEnabled && metrics ? <><BorrowerDirectory rows={rows} contacts={contacts} relationships={relationships} deals={deals} activities={activities} tasks={tasks} people={people} referrals={referrals} appointments={appointments} metrics={metrics} query={q} view={view} page={page} timezone={timezone} writesEnabled={writesEnabled}/><CrmOperationsPanel rows={allRows} deals={deals} writesEnabled={writesEnabled} error={error} saved={saved} view={view}/></> : <ReadsPending />}</AppShell>;
}
function ReadsPending() { return <section className="workspace-placeholder"><p className="eyebrow">Installed default-off</p><h2>Borrower CRM reads are awaiting activation.</h2><p>The directory is implemented, but no relationship records load until the existing tenant-scoped read gate is enabled.</p></section>; }
