import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(resolve("supabase/migrations/20260811204712_document_upload_preparation.sql"), "utf8").toLowerCase();
describe("document upload preparation", () => {
  it("validates tenant deal authority and requirement lineage", () => { for (const value of ["d.organization_id = p_organization_id","a.user_id = v_actor","r.deal_id = p_deal_id","invalid document lineage"]) expect(sql).toContain(value); });
  it("enforces bucket limits and creates organization-scoped paths", () => { expect(sql).toContain("p_size_bytes > 52428800"); expect(sql).toContain("p_organization_id::text || '/' || p_deal_id::text"); expect(sql).toContain("unsupported file type"); });
  it("is atomic and retry safe", () => { expect(sql).toContain("pg_advisory_xact_lock"); expect(sql).toContain("idempotency_key = trim(p_idempotency_key)"); expect(sql).toContain("document_upload.prepared"); });
  it("remains uncommissioned", () => { expect(sql).toContain("revoke all on function public.prepare_document_upload"); expect(sql).not.toContain("grant execute"); expect(sql).not.toMatch(/on storage\.objects/); });
});
