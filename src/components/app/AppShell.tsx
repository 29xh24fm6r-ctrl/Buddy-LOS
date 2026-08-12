import Link from "next/link";
import type { ReactNode } from "react";
import type { AccessContext } from "@/lib/auth/access-context";
import { signOut } from "@/app/login/actions";
import { WorkspaceNavigation } from "@/components/app/WorkspaceNavigation";

type ReadyContext = Extract<AccessContext, { kind: "ready" }>;

const workspaceLabels = {
  administration: "Administration",
  banker: "Banker Workspace",
  underwriting: "Underwriting",
  closing: "Closing",
  read_only: "Read-only Workspace",
} as const;

export function AppShell({ context, children }: { context: ReadyContext; children: ReactNode }) {
  const { activeOrganization } = context;
  const displayName = context.displayName ?? context.email ?? "Institution user";
  const initials = displayName
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link className="los-brand" href="/app" aria-label="Buddy Lending OS home">
          <span className="los-brand-mark">B</span>
          <span><strong>Buddy</strong><small>Lending OS</small></span>
        </Link>

        <div className="workspace-switcher">
          <span className="workspace-switcher-icon">◆</span>
          <span><small>Workspace</small><strong>{workspaceLabels[context.workspace]}</strong></span>
          <span aria-hidden="true">⌄</span>
        </div>

        <p className="institution-name">{activeOrganization.organizationName}</p>
        <WorkspaceNavigation workspace={context.workspace} />

        <div className="sidebar-help">
          <span>?</span>
          <div><strong>Need help?</strong><small>Buddy support center</small></div>
        </div>
        <div className="sidebar-user">
          <span className="user-avatar">{initials || "BU"}</span>
          <span><strong>{displayName}</strong><small>{context.activeOrganization.role.replaceAll("_", " ")}</small></span>
          <form action={signOut}><button type="submit" aria-label="Sign out">↗</button></form>
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}

export function AppHeader({ context, eyebrow, title }: { context: ReadyContext; eyebrow: string; title: string }) {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="header-subtitle">{context.activeOrganization.organizationName} · lending activity, priorities, and pipeline.</p>
      </div>
      <div className="header-actions">
        <Link className="secondary-button" href="/app/crm">Log activity</Link>
        <Link className="primary-button" href="/app/intake">+ New deal</Link>
      </div>
    </header>
  );
}
