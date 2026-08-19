import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationFiles = readdirSync("supabase/migrations").sort();

const canonicalProductionHistory = [
  "20260814143027_activate_internal_buddy_loan_operations_document_intake.sql",
  "20260817181441_dispatch_finalized_document_scan.sql",
  "20260818150213_governed_document_scan_recovery.sql",
  "20260819102000_authorization_activation_hardening.sql",
  "20260819104347_provision_investor_demo_chuck_ogilvie_v2.sql",
  "20260819133526_crm_operating_factory.sql",
  "20260819133532_crm_completion_commissioning_factory.sql",
] as const;

describe("canonical Buddy production migration history", () => {
  it("keeps repository versions aligned with the production ledger", () => {
    for (const migration of canonicalProductionHistory) {
      expect(migrationFiles).toContain(migration);
    }
    const names = migrationFiles.map((file) => file.replace(/^\d+_/, ""));
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps production-only identity and activation records out of fresh environments", () => {
    for (const marker of [canonicalProductionHistory[0], canonicalProductionHistory[4]]) {
      const sql = readFileSync(`supabase/migrations/${marker}`, "utf8").toLowerCase();
      expect(sql).toContain("production-history marker only");
      const executableSql = sql.replace(/^--.*$/gm, "").trim();
      expect(executableSql).toBe("");
    }
  });
});
