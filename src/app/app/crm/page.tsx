import { redirect } from "next/navigation";
import { AppHeader, AppShell } from "@/components/app/AppShell";
import { BorrowerDirectory } from "@/components/crm/BorrowerDirectory";
import { loadAccessContext } from "@/lib/auth/session";
import { readFoundationStatus } from "@/lib/config/foundation-status";
import { deriveBorrowerDirectory, filterBorrowerDirectory } from "@/lib/los/read-model";
import { loadBorrowerDirectory, loadCommandCenterDeals } from "@/lib/los/queries";

export const dynamic = "force-dynamic";
export default async function CrmPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind !== "ready") redirect("/app");
  const readsEnabled = readFoundationStatus().readsEnabled;
  const { q = "" } = await searchParams;
  const [borrowers, deals] = readsEnabled ? await Promise.all([loadBorrowerDirectory(context), loadCommandCenterDeals(context)]) : [[], []];
  const rows = filterBorrowerDirectory(deriveBorrowerDirectory(borrowers, deals), q);
  return <AppShell context={context}><AppHeader context={context} eyebrow="CRM Workspace" title="Borrower relationships" />{readsEnabled ? <BorrowerDirectory rows={rows} query={q} /> : <ReadsPending />}</AppShell>;
}
function ReadsPending() { return <section className="workspace-placeholder"><p className="eyebrow">Installed default-off</p><h2>Borrower CRM reads are awaiting activation.</h2><p>The directory is implemented, but no relationship records load until the existing tenant-scoped read gate is enabled.</p></section>; }
