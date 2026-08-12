"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

export function WorkspaceNavigation() {
  const pathname = usePathname();
  return (
    <nav className="workspace-nav" aria-label="Workspace navigation">
      {groups.map((group) => (
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
