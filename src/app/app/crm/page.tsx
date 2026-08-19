import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { BorrowerDirectory } from "@/components/crm/BorrowerDirectory";
import { CrmOperationsPanel } from "@/components/crm/CrmOperationsPanel";
import { loadAccessContext } from "@/lib/auth/session";
import { readFoundationStatus, writesEnabledForOrganization } from "@/lib/config/foundation-status";
import { deriveBorrowerDirectory } from "@/lib/los/read-model";
import { canOperateCore } from "@/lib/los/core-operations";
import { loadBorrowerDeals, loadBorrowerDirectory, loadCommandCenterDeals, loadCrmActivities, loadCrmAppointments, loadCrmContacts, loadCrmMetrics, loadCrmOperators, loadCrmPeople, loadCrmReferrals, loadCrmRelationships, loadCrmViewTotal, loadDealTasks } from "@/lib/los/queries";

export const dynamic = "force-dynamic";
export default async function CrmPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string; page?: string; error?: string; saved?: string }> }) {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind !== "ready") redirect("/app");
  const readsEnabled = readFoundationStatus().readsEnabled;
  const { q = "", view = "home", page:rawPage, error, saved } = await searchParams;
  const page=Math.max(1,Number.parseInt(rawPage??"1",10)||1);
  const activeView=["home","companies","people","relationships","opportunities","activities","referrals","calendar","tasks","insights","reports"].includes(view)?view:"home";
  const companyPagePromise=activeView==="home"||activeView==="companies"?loadBorrowerDirectory(context,page,activeView==="companies"?q:""):Promise.resolve([]);
  const [companyOptions, dealOptions, companyPage, deals, activities, contacts, relationships, tasks, people, referrals, appointments, metrics, operators, viewTotal] = readsEnabled ? await Promise.all([
    loadBorrowerDirectory(context),loadCommandCenterDeals(context),companyPagePromise,
    activeView==="opportunities"?loadCommandCenterDeals(context,page,q):Promise.resolve([]),
    activeView==="home"||activeView==="activities"?loadCrmActivities(context,page,activeView==="activities"?q:""):Promise.resolve([]),
    activeView==="people"?loadCrmContacts(context,page,q):Promise.resolve([]),
    activeView==="relationships"?loadCrmRelationships(context,page,q):Promise.resolve([]),
    activeView==="tasks"?loadDealTasks(context,undefined,page,q):Promise.resolve([]),
    activeView==="people"?loadCrmPeople(context,page,q):Promise.resolve([]),
    activeView==="referrals"?loadCrmReferrals(context,page,q):Promise.resolve([]),
    activeView==="calendar"?loadCrmAppointments(context,page,q):Promise.resolve([]),
    loadCrmMetrics(context),loadCrmOperators(context),
    ["home","insights","reports"].includes(activeView)?Promise.resolve(0):loadCrmViewTotal(context,activeView,q),
  ]) : [[], [], [], [], [], [], [], [], [], [], [], null, [], 0];
  const companyDeals=readsEnabled?await loadBorrowerDeals(context,companyPage.map(row=>row.id)):[];
  const rows=deriveBorrowerDirectory(companyPage,companyDeals),operationRows=deriveBorrowerDirectory(companyOptions,dealOptions);
  const timezone=context.activeOrganization.timezone;
  const writesEnabled=writesEnabledForOrganization(context.activeOrganization.organizationId)&&canOperateCore(context.activeOrganization.role);
  return <AppShell context={context} surface="crm">{readsEnabled && metrics ? <><BorrowerDirectory rows={rows} contacts={contacts} relationships={relationships} deals={deals} activities={activities} tasks={tasks} people={people} referrals={referrals} appointments={appointments} metrics={metrics} query={q} view={activeView} page={page} viewTotal={viewTotal} timezone={timezone} writesEnabled={writesEnabled}/><CrmOperationsPanel rows={operationRows} deals={dealOptions} people={people} operators={operators} assignmentAdmin={["owner","administrator"].includes(context.activeOrganization.role)} writesEnabled={writesEnabled} error={error} saved={saved} view={activeView}/></> : <ReadsPending />}</AppShell>;
}
function ReadsPending() { return <section className="workspace-placeholder"><p className="eyebrow">Installed default-off</p><h2>Borrower CRM reads are awaiting activation.</h2><p>The directory is implemented, but no relationship records load until the existing tenant-scoped read gate is enabled.</p></section>; }
