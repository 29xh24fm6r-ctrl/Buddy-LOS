import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/20260811190139_core_los_domain.sql"), "utf8").toLowerCase();
const tenantTables = ["organization_teams", "team_memberships", "borrower_contacts", "deals", "borrower_relationships", "deal_assignments", "audit_events"] as const;

describe("core LOS domain migration contract", () => {
  it.each(tenantTables)("enables RLS for %s", (table) => {
    expect(migration).toContain(`alter table public.${table} enable row level security`);
  });

  it.each(tenantTables)("has an anonymous-access revocation covering %s", (table) => {
    const revoke = migration.match(/revoke all on ([\s\S]*?) from anon;/)?.[1] ?? "";
    expect(revoke).toContain(`public.${table}`);
  });

  it("keeps client writes closed", () => {
    expect(migration).not.toMatch(/grant\s+(?:insert|update|delete|all)/i);
    expect(migration).not.toMatch(/for\s+(?:insert|update|delete|all)\s+to\s+authenticated/i);
  });

  it("uses tenant-bound composite foreign keys", () => {
    expect(migration).toContain("foreign key (borrower_id, organization_id)");
    expect(migration).toContain("foreign key (application_id, organization_id)");
    expect(migration).toContain("foreign key (deal_id, organization_id)");
    expect(migration).toContain("foreign key (organization_id, user_id)");
  });

  it("makes audit identifiers ordered and idempotency tenant-scoped", () => {
    expect(migration).toContain("id bigint generated always as identity primary key");
    expect(migration).toContain("unique (organization_id, idempotency_key)");
  });
});
