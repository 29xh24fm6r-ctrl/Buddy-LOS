import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(resolve("supabase/migrations/20260811232942_document_scan_submission_queue.sql"), "utf8").toLowerCase();
describe("document scan submission queue", () => {
  it("claims concurrently without blocking and recovers expired leases", () => { expect(sql).toContain("for update skip locked"); expect(sql).toContain("submission lease expired"); expect(sql).toContain("lease_expires_at"); });
  it("uses bounded attempts and exponential retry timing", () => { expect(sql).toContain("attempt_count between 0 and 5"); expect(sql).toContain("power(2"); expect(sql).toContain("least(3600"); });
  it("binds callbacks to accepted provider runs", () => { expect(sql).toContain("scanner callback does not match an accepted submission"); expect(sql).toContain("record_document_scan_result_v2"); expect(sql).toContain("unique (provider, provider_run_id)"); });
  it("keeps the queue server-only", () => { expect(sql).toContain("enable row level security"); expect(sql).toContain("revoke all on public.document_scan_jobs from public, anon, authenticated"); expect(sql).not.toMatch(/on storage\.objects/); });
});
