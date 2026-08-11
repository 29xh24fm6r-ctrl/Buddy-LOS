import { redirect } from "next/navigation";
import Link from "next/link";
import { loadAccessContext } from "@/lib/auth/session";
import { signOut } from "@/app/login/actions";

const workspaceLabels = {
  administration: "Administration",
  banker: "Banker Workspace",
  underwriting: "Underwriting",
  closing: "Closing",
  read_only: "Read-only Workspace",
} as const;

export const dynamic = "force-dynamic";

export default async function ApplicationPage() {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");

  if (context.kind === "membership_required") {
    return (
      <main className="access-pending">
        <section>
          <p className="eyebrow">Identity verified</p>
          <h1>Institution access is pending.</h1>
          <p>Your account is authenticated, but it has no active bank or credit-union membership. Ask your institution administrator to grant access.</p>
          <form action={signOut}><button type="submit">Sign out</button></form>
        </section>
      </main>
    );
  }

  const { activeOrganization } = context;
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link className="brand" href="/app">Buddy</Link>
        <p className="institution-name">{activeOrganization.organizationName}</p>
        <p className="workspace-pill">{workspaceLabels[context.workspace]}</p>
        <nav aria-label="Workspace navigation">
          <Link aria-current="page" href="/app">Command center</Link>
          <span>CRM</span><span>Deals</span><span>Tasks</span><span>Documents</span><span>Portfolio</span>
        </nav>
        <form action={signOut}><button type="submit">Sign out</button></form>
      </aside>
      <main className="app-main">
        <header className="app-header">
          <div><p className="eyebrow">{workspaceLabels[context.workspace]}</p><h1>Operating command center</h1></div>
          <div className="user-block"><strong>{context.displayName ?? context.email ?? "Institution user"}</strong><span>{activeOrganization.role.replace("_", " ")}</span></div>
        </header>
        <section className="command-ribbon" aria-label="Command center summary">
          <article><span>My pipeline</span><strong>—</strong><small>Data connection pending</small></article>
          <article><span>Needs attention</span><strong>—</strong><small>Workflow port pending</small></article>
          <article><span>Upcoming closings</span><strong>—</strong><small>Closing port pending</small></article>
          <article><span>Portfolio alerts</span><strong>—</strong><small>Portfolio port pending</small></article>
        </section>
        <section className="workspace-placeholder">
          <p className="eyebrow">Native SaaS shell</p>
          <h2>Identity and institution boundaries are ready.</h2>
          <p>The original Commercial LOS command-center layouts will be mounted here subsystem by subsystem. No operational data or actions are simulated.</p>
        </section>
      </main>
    </div>
  );
}
