import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20260817181441_dispatch_finalized_document_scan.sql"),
  "utf8",
).toLowerCase();

describe("finalized document scan dispatch", () => {
  it("claims only the requested quarantined document", () => {
    expect(sql).toContain("claim_document_scan_job_for_document");
    expect(sql).toContain("where d.id=p_document_id for update");
    expect(sql).toContain("v_document.security_status<>'quarantined'");
    expect(sql).toContain("j.document_id=p_document_id");
  });

  it("remains restricted to the trusted service role", () => {
    expect(sql).toContain("auth.jwt()->>'role'");
    expect(sql).toContain("revoke all on function public.claim_document_scan_job_for_document(uuid) from public,anon,authenticated,service_role");
    expect(sql).toContain("grant execute on function public.claim_document_scan_job_for_document(uuid) to service_role");
  });
});
