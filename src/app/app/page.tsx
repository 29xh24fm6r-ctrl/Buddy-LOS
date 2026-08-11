import { redirect } from "next/navigation";
import { loadAccessContext } from "@/lib/auth/session";
import { readFoundationStatus } from "@/lib/config/foundation-status";
import { deriveBankerCommandCenter } from "@/lib/los/read-model";
import { loadCommandCenterDeals } from "@/lib/los/queries";
import { AppHeader, AppShell } from "@/components/app/AppShell";
import { BankerCommandCenter } from "@/components/banker/BankerCommandCenter";
import { signOut } from "@/app/login/actions";

export const dynamic = "force-dynamic";

export default async function ApplicationPage() {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind === "membership_required") return <AccessPending />;
  const readsEnabled = readFoundationStatus().readsEnabled;
  const deals = readsEnabled ? await loadCommandCenterDeals(context) : [];

  return (
    <AppShell context={context}>
      <AppHeader context={context} eyebrow="Banker Workspace" title="Operating command center" />
      {readsEnabled ? <BankerCommandCenter model={deriveBankerCommandCenter(deals)} /> : <ReadsPending />}
    </AppShell>
  );
}

function ReadsPending() { return <section className="workspace-placeholder"><p className="eyebrow">Installed default-off</p><h2>Native pipeline reads are awaiting activation.</h2><p>The command center is implemented, but no live lending records will load until read isolation is certified and the read feature flag is enabled.</p></section>; }
function AccessPending() { return <main className="access-pending"><section><p className="eyebrow">Identity verified</p><h1>Institution access is pending.</h1><p>Your account has no active bank or credit-union membership. Ask your institution administrator to grant access.</p><form action={signOut}><button type="submit">Sign out</button></form></section></main>; }
