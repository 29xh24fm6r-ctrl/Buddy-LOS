import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/20260811194612_governed_loan_intake.sql"), "utf8").toLowerCase();
const signature = "public.create_loan_intake(uuid, text, text, public.borrower_kind, text, text, text, text, text, numeric, date)";

describe("governed loan intake migration contract", () => {
  it("uses an authenticated tenant-and-role authorization check", () => {
    expect(migration).toContain("v_actor_user_id uuid := (select auth.uid())");
    expect(migration).toContain("membership.organization_id = p_organization_id");
    expect(migration).toContain("membership.user_id = v_actor_user_id");
    expect(migration).toContain("membership.role in ('owner', 'administrator', 'lender')");
  });

  it("creates the lending spine and audit event in one function", () => {
    for (const table of ["borrowers", "loan_applications", "deals", "deal_assignments", "audit_events"])
      expect(migration).toContain(`insert into public.${table}`);
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("event.idempotency_key = trim(p_idempotency_key)");
  });

  it("hardens the definer and remains database-default-off", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(`revoke all on function ${signature} from public`);
    expect(migration).toContain(`revoke all on function ${signature} from authenticated`);
    expect(migration).not.toContain(`grant execute on function ${signature}`);
  });
});
