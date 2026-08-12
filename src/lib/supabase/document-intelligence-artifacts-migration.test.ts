import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/20260812190000_document_intelligence_artifacts.sql"), "utf8").toLowerCase();

describe("document intelligence artifact migration", () => {
  it("binds artifacts to tenant, job, deal, document version, and hash", () => {
    expect(migration).toContain("create table public.document_intelligence_artifacts");
    expect(migration).toContain("foreign key (job_id, organization_id)");
    expect(migration).toContain("foreign key (deal_id, organization_id)");
    expect(migration).toContain("foreign key (document_id, organization_id)");
    expect(migration).toContain("document_sha256 text not null");
  });

  it("requires versioned engines and review for AI classification", () => {
    expect(migration).toContain("contract_version = 'buddy-document-intelligence.v1'");
    expect(migration).toContain("engine_version text not null");
    expect(migration).toContain("classifier_version text not null");
    expect(migration).toContain("classification_tier <> 'ai_assist' or review_status = 'needs_review'");
  });

  it("keeps artifact creation server-only and execution unavailable", () => {
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)/);
    expect(migration).not.toContain("create function public.record_document_intelligence");
    expect(migration).not.toContain("create function public.claim_underwriting");
  });
});
