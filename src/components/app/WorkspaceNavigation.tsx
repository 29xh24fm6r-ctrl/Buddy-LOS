"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkspaceKey } from "@/lib/auth/access-context";

const groups = [
  {
    label: "My pipeline",
    items: [
      { href: "/app", label: "Dashboard", icon: "⌂", exact: true },
      { href: "/app/deals", label: "Active deals", icon: "▤" },
      { href: "/app/deals", label: "My alerts", icon: "!" },
    ],
  },
  {
    label: "Work queue",
    items: [
      { href: "/app/deals", label: "Tasks & actions", icon: "✓" },
      { href: "/app/deals", label: "Due diligence", icon: "⌕" },
    ],
  },
  {
    label: "Relationships",
    items: [
      { href: "/app/crm", label: "CRM hub", icon: "◎" },
      { href: "/app/crm", label: "Activity log", icon: "≋" },
    ],
  },
  {
    label: "Resources",
    items: [{ href: "/app/intake", label: "Loan workflow", icon: "◇" }],
  },
] as const;

const institutionalGroups = [
  { label: "Institution", items: [{ href: "/app", label: "Command center", icon: "⌂", exact: true }, { href: "/app/deals", label: "Portfolio pipeline", icon: "▥" }, { href: "/app/deals", label: "Risk & exceptions", icon: "!" }] },
  { label: "Operations", items: [{ href: "/app/deals", label: "Team work queue", icon: "✓" }, { href: "/app/intake", label: "Loan production", icon: "◇" }, { href: "/app/crm", label: "Relationships", icon: "◎" }] },
  { label: "Management", items: [{ href: "/app", label: "Performance", icon: "↗" }, { href: "/app", label: "Data quality", icon: "◈" }] },
] as const;

export function WorkspaceNavigation({ workspace }: { workspace: WorkspaceKey }) {
  const pathname = usePathname();
  const visibleGroups = workspace === "administration" || workspace === "read_only" ? institutionalGroups : groups;
  return (
    <nav className="workspace-nav" aria-label="Workspace navigation">
      {visibleGroups.map((group) => (
        <section key={group.label}>
          <p>{group.label}</p>
          {group.items.map((item) => {
            const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link href={item.href} key={`${group.label}-${item.label}`} aria-current={active ? "page" : undefined}>
                <span aria-hidden="true">{item.icon}</span>{item.label}
              </Link>
            );
          })}
        </section>
      ))}
    </nav>
  );
}
