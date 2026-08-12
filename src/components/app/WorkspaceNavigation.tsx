"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkspaceKey } from "@/lib/auth/access-context";
import { LosIcon, type LosIconName } from "@/components/app/LosIcon";

type NavItem = { href: string; label: string; icon: LosIconName; exact?: boolean };
type NavGroup = { label: string; items: readonly NavItem[] };

const bankerGroups: readonly NavGroup[] = [
  { label: "My pipeline", items: [{ href: "/app", label: "Dashboard", icon: "dashboard", exact: true }, { href: "/app/deals", label: "Active deals", icon: "deals" }, { href: "/app/deals", label: "My alerts", icon: "alert" }] },
  { label: "Work queue", items: [{ href: "/app/deals", label: "Tasks & actions", icon: "tasks" }, { href: "/app/deals", label: "Due diligence", icon: "documents" }] },
  { label: "Relationships", items: [{ href: "/app/crm", label: "CRM hub", icon: "crm" }, { href: "/app/crm", label: "Activity log", icon: "activity" }] },
  { label: "Resources", items: [{ href: "/app/intake", label: "Loan workflow", icon: "workflow" }] },
];

const institutionalGroups: readonly NavGroup[] = [
  { label: "Institution", items: [{ href: "/app", label: "Command center", icon: "dashboard", exact: true }, { href: "/app/deals", label: "Portfolio pipeline", icon: "deals" }, { href: "/app/deals", label: "Risk & exceptions", icon: "alert" }] },
  { label: "Operations", items: [{ href: "/app/deals", label: "Team work queue", icon: "tasks" }, { href: "/app/intake", label: "Loan production", icon: "workflow" }, { href: "/app/crm", label: "Relationships", icon: "crm" }] },
  { label: "Management", items: [{ href: "/app", label: "Performance", icon: "activity" }, { href: "/app", label: "Data quality", icon: "documents" }] },
];

export function WorkspaceNavigation({ workspace }: { workspace: WorkspaceKey }) {
  const pathname = usePathname();
  const visibleGroups = workspace === "administration" || workspace === "read_only" ? institutionalGroups : bankerGroups;
  return (
    <nav className="workspace-nav" aria-label="Workspace navigation">
      {visibleGroups.map((group) => (
        <section key={group.label}>
          <p>{group.label}</p>
          {group.items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return <Link href={item.href} key={`${group.label}-${item.label}`} aria-current={active ? "page" : undefined}><span><LosIcon name={item.icon} /></span>{item.label}</Link>;
          })}
        </section>
      ))}
    </nav>
  );
}
