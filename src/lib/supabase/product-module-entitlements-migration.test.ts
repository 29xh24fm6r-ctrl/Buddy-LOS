import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260812170000_product_module_entitlements.sql"),
  "utf8",
).toLowerCase();

describe("product module entitlement migration", () => {
  it("creates trusted organization-scoped module records", () => {
    expect(migration).toContain("create table public.organization_product_modules");
    expect(migration).toContain("primary key (organization_id, module_key)");
    expect(migration).toContain("references public.organizations(id)");
  });

  it("keeps module activation default-off and server-gated", () => {
    expect(migration).not.toMatch(/insert\s+into\s+public\.organization_product_modules/);
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)/);
    expect(migration).not.toMatch(/for\s+(insert|update|delete|all)\s+to\s+authenticated/);
  });

  it("allows authenticated users to read only their active tenant memberships", () => {
    expect(migration).toContain("alter table public.organization_product_modules enable row level security");
    expect(migration).toContain("membership.user_id = (select auth.uid())");
    expect(migration).toContain("membership.is_active");
  });
});
