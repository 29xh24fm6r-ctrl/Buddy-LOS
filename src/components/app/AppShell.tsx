import Link from "next/link";
import type { ReactNode } from "react";
import type { AccessContext } from "@/lib/auth/access-context";
import { signOut } from "@/app/login/actions";
import { LosIcon } from "@/components/app/LosIcon";
import { WorkspaceNavigation } from "@/components/app/WorkspaceNavigation";
import { ShareWorkspaceButton } from "@/components/app/AppUtilityActions";
import { allowedWorkspaceSurfaces, workspaceSurfaceHref, workspaceSurfaceLabels, type WorkspaceSurface } from "@/lib/workspace-surfaces";

type ReadyContext = Extract<AccessContext, { kind: "ready" }>;

export function AppShell({ context, surface, children }: { context: ReadyContext; surface: WorkspaceSurface; children: ReactNode }) {
  const { activeOrganization } = context;
  const displayName = context.displayName ?? context.email ?? "Institution user";
  const initials = displayName.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
  const surfaces = allowedWorkspaceSurfaces(activeOrganization.role);

  return (
    <div className="los-frame">
      <a className="skip-link" href="#workspace-content">Skip to workspace content</a>
      <header className="los-system-bar" aria-label="Application controls">
        <span className="system-launcher" aria-hidden="true">•••<br />•••<br />•••</span>
        <strong className="system-product">Buddy LOS <span>|</span> Commercial Lending LOS</strong><span className="system-info" aria-hidden="true">i</span>
        <span className="system-spacer" />
        <ShareWorkspaceButton />
        <span className="system-more" aria-hidden="true">•••</span>
        <span className="system-avatar">{initials || "BU"}</span>
      </header>
      <div className="app-shell">
        <aside className="app-sidebar">
          <Link className="los-brand" href="/app?surface=banker" aria-label="Buddy Lending OS home">
            <span className="los-brand-mark"><LosIcon name="building" /></span>
            <span><strong>Lending OS</strong><small>{activeOrganization.organizationName}</small></span>
          </Link>
          <details className="mobile-nav-disclosure">
            <summary>
              <span className="mobile-nav-menu-icon" aria-hidden="true">☰</span>
              <span><small>Navigation</small><strong>{workspaceSurfaceLabels[surface]}</strong></span>
              <span className="mobile-nav-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div className="mobile-nav-content">
              <nav className="workspace-menu" aria-label="Workspace switcher">
                <p>Workspace</p>
                {surfaces.map((item) => (
                  <Link href={workspaceSurfaceHref(item)} aria-current={item === surface ? "page" : undefined} key={item}>{workspaceSurfaceLabels[item]}</Link>
                ))}
              </nav>
              <WorkspaceNavigation surface={surface} />
              <div className="sidebar-user">
                <span className="user-avatar">{initials || "BU"}</span>
                <span><strong>{displayName}</strong><small>{context.email ?? activeOrganization.role.replaceAll("_", " ")}</small></span>
                <form action={signOut}><button type="submit" aria-label="Sign out"><LosIcon name="arrow" /></button></form>
              </div>
            </div>
          </details>
        </aside>
        <main id="workspace-content" className="app-main" tabIndex={-1}>{children}</main>
      </div>
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

export function WorkspaceHeader({ eyebrow, title, subtitle, context, surface }: { eyebrow: string; title: string; subtitle: string; context: ReadyContext; surface: WorkspaceSurface }) {
  return (
    <header className="workspace-command-header">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>
      <aside aria-label={`${workspaceSurfaceLabels[surface]} context`}><nav className="workspace-header-switcher" aria-label="Workspace shortcuts">{allowedWorkspaceSurfaces(context.activeOrganization.role).map((item)=><Link href={workspaceSurfaceHref(item)} aria-current={item===surface?"page":undefined} key={item}>{workspaceSurfaceLabels[item]}</Link>)}</nav><small>Workspace</small><strong>{workspaceSurfaceLabels[surface]}</strong><small>Team</small><strong>{context.activeOrganization.organizationName}</strong><small>Signed in</small><strong>{context.displayName ?? context.email ?? "Institution user"}</strong><span>{context.email}</span></aside>
    </header>
  );
}

function formatCompactCurrency(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
