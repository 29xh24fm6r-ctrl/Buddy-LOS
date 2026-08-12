import { redirect } from "next/navigation";
import { loadAccessContext } from "@/lib/auth/session";
import { readFoundationStatus } from "@/lib/config/foundation-status";
import { deriveBankerCommandCenter } from "@/lib/los/read-model";
import { loadCommandCenterDeals } from "@/lib/los/queries";
import { AppHeader, AppShell, WorkspaceHeader } from "@/components/app/AppShell";
import { BankerCommandCenter } from "@/components/banker/BankerCommandCenter";
import { RoleCommandCenter } from "@/components/institution/RoleCommandCenter";
import { signOut } from "@/app/login/actions";
import { resolveWorkspaceSurface } from "@/lib/workspace-surfaces";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({ searchParams }: { searchParams: Promise<{ surface?: string }> }) {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind === "membership_required") return <AccessPending />;
  const readsEnabled = readFoundationStatus().readsEnabled;
  const deals = readsEnabled ? await loadCommandCenterDeals(context) : [];
  const model = deriveBankerCommandCenter(deals);
  const requested = (await searchParams).surface;
  const surface = resolveWorkspaceSurface(requested, context.activeOrganization.role, context.workspace);
  if (surface === "crm") redirect("/app/crm");

  const workspaceTitles = {
    team: ["Commercial lending", "Team Command Center", "Shared pipeline, bottlenecks, document needs, and task load across the team."],
    manager: ["Commercial lending", "Manager Command Center", "Team pipeline health, banker production, and risk roll-up."],
    portfolio: ["Commercial lending", "Portfolio Command Center", "Live authorized portfolio exposure, mix, and risk roll-up."],
    admin: ["Commercial lending", "Admin Command Center", "Institution configuration, operational health, and governed access."],
  } as const;

  return (
    <AppShell context={context} surface={surface}>
      {surface === "banker" ? <AppHeader context={context} eyebrow="Banker Workspace" title="Operating command center" pipelineAmount={model.totalExposure} activeDeals={model.totalActive} attentionCount={model.needsAttention} /> : <WorkspaceHeader context={context} surface={surface} eyebrow={workspaceTitles[surface][0]} title={workspaceTitles[surface][1]} subtitle={workspaceTitles[surface][2]} />}
      {readsEnabled ? (surface === "banker" ? <BankerCommandCenter model={model} /> : <RoleCommandCenter surface={surface} model={model} />) : <ReadsPending />}
    </AppShell>
  );
}

function ReadsPending() { return <section className="workspace-placeholder"><p className="eyebrow">Installed default-off</p><h2>Native pipeline reads are awaiting activation.</h2><p>The command center is implemented, but no live lending records will load until read isolation is certified and the read feature flag is enabled.</p></section>; }
function AccessPending() { return <main className="access-pending"><section><p className="eyebrow">Identity verified</p><h1>Institution access is pending.</h1><p>Your account has no active bank or credit-union membership. Ask your institution administrator to grant access.</p><form action={signOut}><button type="submit">Sign out</button></form></section></main>; }
