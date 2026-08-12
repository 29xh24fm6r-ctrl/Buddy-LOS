"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LosIcon, type LosIconName } from "@/components/app/LosIcon";
import type { WorkspaceSurface } from "@/lib/workspace-surfaces";

type NavItem = { href: string; label: string; icon: LosIconName; exact?: boolean; view?: string };
type NavGroup = { label: string; items: readonly NavItem[] };

function groupsFor(surface: WorkspaceSurface): readonly NavGroup[] {
  const suffix = surface === "crm" ? "" : `?surface=${surface}`;
  return [
    { label: "My pipeline", items: [{ href: `/app${suffix}`, label: "Dashboard", icon: "dashboard", exact: true }, { href: withView(`/app/deals${suffix}`, "active"), label: "Active deals", icon: "deals", view: "active" }, { href: withView(`/app/deals${suffix}`, "alerts"), label: "My alerts", icon: "alert", view: "alerts" }] },
    { label: "Work queue", items: [{ href: withView(`/app/deals${suffix}`, "tasks"), label: "Tasks & actions", icon: "tasks", view: "tasks" }, { href: withView(`/app/deals${suffix}`, "due-diligence"), label: "Due diligence", icon: "documents", view: "due-diligence" }] },
    { label: "Relationships", items: [{ href: "/app/crm", label: "CRM hub", icon: "crm" }, { href: "/app/crm?view=activities", label: "Activity log", icon: "activity", view: "activities" }] },
    { label: "Resources", items: [{ href: `/app/intake${suffix}`, label: "Loan workflow", icon: "workflow" }] },
  ];
}

export function WorkspaceNavigation({ surface }: { surface: WorkspaceSurface }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view");
  return (
    <nav className="workspace-nav" aria-label="Workspace navigation">
      {groupsFor(surface).map((group) => (
        <section key={group.label}>
          <p>{group.label}</p>
          {group.items.map((item) => {
            const itemPath = item.href.split("?")[0];
            const active = item.exact
              ? pathname === itemPath
              : pathname.startsWith(itemPath) && (item.view ? currentView === item.view || (item.view === "active" && !currentView) : !currentView);
            return <Link href={item.href} key={`${group.label}-${item.label}`} aria-current={active ? "page" : undefined}><span><LosIcon name={item.icon} /></span>{item.label}</Link>;
          })}
        </section>
      ))}
    </nav>
  );
}

function withView(href: string, view: string) {
  return `${href}${href.includes("?") ? "&" : "?"}view=${view}`;
}
