import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { BorrowerDirectory } from "@/components/crm/BorrowerDirectory";
import { CrmOperationsPanel } from "@/components/crm/CrmOperationsPanel";
import { loadAccessContext } from "@/lib/auth/session";
import { readFoundationStatus, writesEnabledForOrganization } from "@/lib/config/foundation-status";
import { canOperateCore } from "@/lib/los/core-operations";
import {
  loadBorrowerDeals, loadBorrowerDirectory, loadCommandCenterDeals, loadCrmActivities,
  loadCrmAppointments, loadCrmArchivedRecords, loadCrmContacts, loadCrmMetrics,
  loadCrmOperators, loadCrmPeople, loadCrmReferrals, loadCrmRelationships,
  loadCrmViewTotal, loadDealTasks,
} from "@/lib/los/queries";
import { deriveBorrowerDirectory } from "@/lib/los/read-model";

export const dynamic = "force-dynamic";

type CrmSearchParams = { q?:string; view?:string; page?:string; pick?:string; error?:string; saved?:string };
const views=["home","companies","people","relationships","opportunities","activities","referrals","calendar","tasks","insights","reports"];

export default async function CrmPage({searchParams}:{searchParams:Promise<CrmSearchParams>}){
  const context=await loadAccessContext();
  if(context.kind==="unauthenticated")redirect("/login");
  if(context.kind!=="ready")redirect("/app");
  const readsEnabled=readFoundationStatus().readsEnabled;
  const{q="",view="home",page:rawPage,pick="",error,saved}=await searchParams;
  const page=Math.max(1,Number.parseInt(rawPage??"1",10)||1),activeView=views.includes(view)?view:"home";
  const companyPagePromise=activeView==="home"||activeView==="companies"?loadBorrowerDirectory(context,page,activeView==="companies"?q:""):Promise.resolve([]);
  const results=readsEnabled?await Promise.all([
    loadBorrowerDirectory(context,1,pick),
    loadCommandCenterDeals(context,1,pick),
    companyPagePromise,
    activeView==="opportunities"?loadCommandCenterDeals(context,page,q):Promise.resolve([]),
    activeView==="home"||activeView==="activities"?loadCrmActivities(context,page,activeView==="activities"?q:""):Promise.resolve([]),
    activeView==="people"?loadCrmContacts(context,page,q):Promise.resolve([]),
    activeView==="relationships"?loadCrmRelationships(context,page,q):Promise.resolve([]),
    activeView==="tasks"?loadDealTasks(context,undefined,page,q):Promise.resolve([]),
    activeView==="people"?loadCrmPeople(context,page,q):Promise.resolve([]),
    ["people","referrals"].includes(activeView)?loadCrmPeople(context,1,pick):Promise.resolve([]),
    activeView==="referrals"?loadCrmReferrals(context,page,q):Promise.resolve([]),
    activeView==="calendar"?loadCrmAppointments(context,page,q):Promise.resolve([]),
    loadCrmMetrics(context),
    loadCrmOperators(context),
    ["home","insights","reports"].includes(activeView)?Promise.resolve(0):loadCrmViewTotal(context,activeView,q),
    loadCrmArchivedRecords(context,activeView),
  ]):[[],[],[],[],[],[],[],[],[],[],[],[],null,[],0,[]] as const;
  const[companyOptions,dealOptions,companyPage,deals,activities,contacts,relationships,tasks,people,personOptions,referrals,appointments,metrics,operators,viewTotal,archivedRecords]=results;
  const companyDeals=readsEnabled?await loadBorrowerDeals(context,companyPage.map(row=>row.id)):[];
  const rows=deriveBorrowerDirectory(companyPage,companyDeals),operationRows=deriveBorrowerDirectory(companyOptions,dealOptions);
  const timezone=context.activeOrganization.timezone,writesEnabled=writesEnabledForOrganization(context.activeOrganization.organizationId)&&canOperateCore(context.activeOrganization.role);
  return <AppShell context={context} surface="crm">{readsEnabled&&metrics?<>
    <BorrowerDirectory rows={rows} contacts={contacts} relationships={relationships} deals={deals} activities={activities} tasks={tasks} people={people} referrals={referrals} appointments={appointments} operators={operators} metrics={metrics} query={q} view={activeView} page={page} viewTotal={viewTotal} timezone={timezone} writesEnabled={writesEnabled}/>
    <CrmOperationsPanel rows={operationRows} deals={dealOptions} people={personOptions} operators={operators} archivedRecords={archivedRecords} assignmentAdmin={["owner","administrator"].includes(context.activeOrganization.role)} writesEnabled={writesEnabled} error={error} saved={saved} view={activeView} pickerQuery={pick} timezone={timezone}/>
  </>:<ReadsPending/>}</AppShell>;
}

function ReadsPending(){return <section className="workspace-placeholder"><p className="eyebrow">Installed default-off</p><h2>Borrower CRM reads are awaiting activation.</h2><p>The directory is implemented, but no relationship records load until the existing tenant-scoped read gate is enabled.</p></section>;}
