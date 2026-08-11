import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const migration = readFileSync(resolve("supabase/migrations/20260811202259_underwriting_readiness.sql"), "utf8").toLowerCase();
const tables = ["application_checklist_items", "deal_document_requirements"];
describe("underwriting readiness migration", () => {
  it.each(tables)("enables RLS and explicit authenticated reads for %s", (table) => {
    expect(migration).toContain(`alter table public.${table} enable row level security`);
    expect(migration).toContain(`public.${table}`);
  });
  it("keeps underwriting writes closed", () => {
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)/);
    expect(migration).not.toMatch(/for\s+(insert|update|delete|all)\s+to\s+authenticated/);
  });
  it("binds every requirement to a tenant-scoped deal", () => {
    expect(migration.match(/foreign key \(deal_id, organization_id\)/g)?.length).toBe(2);
    expect(migration.match(/deal\.organization_id = .*\.organization_id/g)?.length).toBe(2);
  });
});
