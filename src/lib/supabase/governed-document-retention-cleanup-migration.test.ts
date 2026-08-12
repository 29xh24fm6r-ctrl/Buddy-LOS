import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql=readFileSync(resolve("supabase/migrations/20260812132228_governed_document_retention_cleanup.sql"),"utf8").toLowerCase();
describe("governed document retention cleanup",()=>{
  it("never shortens retention or silently releases legal hold",()=>{expect(sql).toContain("document retention cannot be shortened");expect(sql).toContain("legal_hold=legal_hold or");});
  it("treats missing retention as indefinite and rechecks before completion",()=>{expect(sql).toContain("retained_until is not null");expect(sql).toContain("document retention blocks cleanup completion");});
  it("provides grace, lease recovery, bounded retries, and nonblocking claims",()=>{for(const value of ["interval '24 hours'","for update skip locked","cleanup lease expired","attempt_count between 0 and 5"])expect(sql).toContain(value);});
  it("keeps browser disposal closed and preserves recoverable audit tombstones",()=>{expect(sql).toContain("revoke all on public.document_cleanup_jobs from public,anon,authenticated");expect(sql).toContain("document_cleanup.completed");expect(sql).toContain("deleted_at=now()");expect(sql).toContain("'_disposal/'");expect(sql).not.toMatch(/on storage\.objects/);});
});
