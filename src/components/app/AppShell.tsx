import Link from "next/link";
import type { ReactNode } from "react";
import type { AccessContext } from "@/lib/auth/access-context";
import { signOut } from "@/app/login/actions";
import { LosIcon } from "@/components/app/LosIcon";
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
  const initials = displayName.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link className="los-brand" href="/app" aria-label="Buddy Lending OS home">
          <span className="los-brand-mark"><LosIcon name="building" /></span>
          <span><strong>Lending OS</strong><small>Buddy Loan Operations</small></span>
        </Link>
        <div className="workspace-switcher">
          <span className="workspace-switcher-icon"><LosIcon name="workflow" /></span>
          <span><small>Current workspace</small><strong>{workspaceLabels[context.workspace]}</strong></span>
        </div>
        <p className="institution-name">{activeOrganization.organizationName}</p>
        <WorkspaceNavigation workspace={context.workspace} />
        <div className="sidebar-user">
          <span className="user-avatar">{initials || "BU"}</span>
          <span><strong>{displayName}</strong><small>{activeOrganization.role.replaceAll("_", " ")}</small></span>
          <form action={signOut}><button type="submit" aria-label="Sign out"><LosIcon name="arrow" /></button></form>
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}

export function AppHeader({ context, eyebrow, title, pipelineAmount, activeDeals, attentionCount }: { context: ReadyContext; eyebrow: string; title: string; pipelineAmount?: number; activeDeals?: number; attentionCount?: number }) {
  const firstName = (context.displayName ?? context.email ?? "Banker").split(/[\s@]/)[0];
  return (
    <header className="app-header">
      <div className="app-header-top">
        <div><p className="eyebrow">{eyebrow}</p><h1>Good afternoon, {firstName}</h1><p className="header-subtitle">{title} · {activeDeals ?? 0} active deal{activeDeals === 1 ? "" : "s"}</p></div>
        <div className="header-actions"><Link className="secondary-button" href="/app/crm">Log activity</Link><Link className="primary-button" href="/app/intake">+ New deal</Link></div>
      </div>
      <div className="app-header-pipeline">
        <div><strong>{pipelineAmount === undefined ? "—" : formatCompactCurrency(pipelineAmount)}</strong><span>Total pipeline · across active deals</span></div>
        {!!attentionCount && <em>{attentionCount} urgent</em>}
      </div>
    </header>
  );
}

function formatCompactCurrency(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
