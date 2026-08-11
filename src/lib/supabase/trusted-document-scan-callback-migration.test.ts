import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260811225946_trusted_document_scan_callback.sql"), "utf8").toLowerCase();

describe("trusted document scan callback migration", () => {
  it("grants only the trusted server role", () => {
    expect(sql).toContain("grant execute on function public.record_document_scan_result");
    expect(sql).toContain("to service_role");
    expect(sql).not.toMatch(/to\s+(anon|authenticated)/);
    expect(sql).not.toMatch(/on storage\.objects/);
  });
});
