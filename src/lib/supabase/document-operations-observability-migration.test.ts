import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260812142922_document_operations_observability.sql"), "utf8").toLowerCase();

describe("document operations observability migration", () => {
  it("returns only aggregate queue health", () => {
    expect(sql).toContain("buddy-document-operations-health-v1");
    expect(sql).toContain("oldestreadyageseconds");
    expect(sql).toContain("awaitingresultover15minutes");
    expect(sql).not.toContain("last_error");
    expect(sql).not.toContain("storage_path");
    expect(sql).not.toContain("provider_run_id");
  });

  it("is callable only by the service role", () => {
    expect(sql).toContain("trusted document operations authority required");
    expect(sql).toContain("revoke all on function public.get_document_operations_health() from public,anon,authenticated,service_role");
    expect(sql).toContain("grant execute on function public.get_document_operations_health() to service_role");
  });
});
