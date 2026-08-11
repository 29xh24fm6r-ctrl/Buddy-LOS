import { readFileSync } from "node:fs"; import { resolve } from "node:path"; import { describe,expect,it } from "vitest";
const sql=readFileSync(resolve("supabase/migrations/20260811205349_document_quarantine_completion.sql"),"utf8").toLowerCase();
describe("document quarantine completion",()=>{
  it("requires trusted scanner authority and terminal outcomes",()=>{expect(sql).toContain("auth.jwt()->>'role'");expect(sql).toContain("is distinct from 'service_role'");expect(sql).toContain("p_result not in ('clean','rejected')");});
  it("binds immutable scan evidence",()=>{for(const value of ["unique (scanner_provider, scanner_run_id)","sha256 ~ '^[0-9a-f]{64}$'","document hash mismatch","scanner run identity conflict"]) expect(sql).toContain(value);});
  it("locks the document and closes repeated terminal transitions",()=>{expect(sql).toContain("for update");expect(sql).toContain("security_status not in ('pending_upload','quarantined','scanning')");});
  it("remains uncommissioned",()=>{expect(sql).toContain("from public,anon,authenticated,service_role");expect(sql).not.toContain("grant execute");});
});
