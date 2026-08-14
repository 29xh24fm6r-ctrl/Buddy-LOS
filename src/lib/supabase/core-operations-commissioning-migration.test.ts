import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260814141824_commission_internal_core_operations.sql"),
  "utf8",
).toLowerCase();

describe("core operations commissioning migration", () => {
  it("keeps tenant activation data outside the schema migration", () => {
    expect(migration).not.toMatch(/insert\s+into\s+public\.organization_product_modules/);
    expect(migration).not.toContain("9e3f6b9b-7116-41e7-8be4-a0ff97d4bcd7");
  });

  it("requires an active document-intake entitlement", () => {
    expect(migration).toContain("create function public.require_core_operations_entitlement");
    expect(migration).toContain("module.module_key = 'document_intake'");
    expect(migration).toContain("module.status in ('trial', 'active')");
    expect(migration).toContain("perform public.require_core_operations_entitlement(p_organization_id)");
  });

  it("exposes only the entitlement-checking intake wrapper", () => {
    expect(migration).toContain("rename to create_loan_intake_uncommissioned");
    expect(migration).toMatch(/revoke all on function public\.create_loan_intake_uncommissioned\([\s\s]*uuid/);
    expect(migration).toContain("grant execute on function public.create_loan_intake(");
    expect(migration).toContain("to authenticated");
  });
});
