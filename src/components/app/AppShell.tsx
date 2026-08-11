import Link from "next/link";
import type { ReactNode } from "react";
import type { AccessContext } from "@/lib/auth/access-context";
import { signOut } from "@/app/login/actions";

type ReadyContext = Extract<AccessContext, { kind: "ready" }>;
const workspaceLabels = { administration: "Administration", banker: "Banker Workspace", underwriting: "Underwriting", closing: "Closing", read_only: "Read-only Workspace" } as const;

export function AppShell({ context, children }: { context: ReadyContext; children: ReactNode }) {
  const { activeOrganization } = context;
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link className="brand" href="/app">Buddy</Link>
        <p className="institution-name">{activeOrganization.organizationName}</p>
        <p className="workspace-pill">{workspaceLabels[context.workspace]}</p>
        <nav aria-label="Workspace navigation">
          <Link href="/app">Command center</Link>
          <Link href="/app/crm">CRM</Link><Link href="/app/deals">Deals</Link><Link href="/app/intake">New intake</Link><span>Tasks</span><span>Documents</span><span>Portfolio</span>
        </nav>
        <form action={signOut}><button type="submit">Sign out</button></form>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}

export function AppHeader({ context, eyebrow, title }: { context: ReadyContext; eyebrow: string; title: string }) {
  return (
    <header className="app-header">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
      <div className="user-block"><strong>{context.displayName ?? context.email ?? "Institution user"}</strong><span>{context.activeOrganization.role.replace("_", " ")}</span></div>
    </header>
  );
}
