import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260811193312_assignment_scoped_lending_reads.sql"),
  "utf8",
).toLowerCase();

describe("assignment-scoped lending read policies", () => {
  it.each(["deals", "borrowers", "borrower_contacts"])("replaces the broad %s read policy", (table) => {
    expect(migration).toContain(`drop policy`);
    expect(migration).toContain(`on public.${table}`);
    expect(migration).toContain(`${table}_read_authorized`);
  });

  it("requires a current assignment for ordinary-role deal access", () => {
    expect(migration).toContain("assignment.user_id = (select auth.uid())");
    expect(migration).toContain("assignment.ended_at is null");
  });

  it("limits institution-wide reads to explicit roles", () => {
    expect(migration).toContain("membership.role in ('owner', 'administrator', 'viewer')");
    expect(migration).not.toMatch(/membership\.role\s+in\s*\([^)]*'lender'/);
  });
});
