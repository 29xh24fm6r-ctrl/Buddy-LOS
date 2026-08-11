import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const migration = readFileSync(resolve("supabase/migrations/20260811203236_private_document_foundation.sql"), "utf8").toLowerCase();
describe("private document foundation", () => {
  it("creates a private constrained bucket", () => {
    expect(migration).toContain("'loan-documents', 'loan-documents', false, 52428800");
    expect(migration).toContain("allowed_mime_types");
  });
  it("tracks immutable versions, hash, scan, retention, and legal hold", () => {
    for (const contract of ["unique (logical_document_id, version_number)", "sha256", "security_status", "retained_until", "legal_hold"]) expect(migration).toContain(contract);
  });
  it("keeps object and metadata writes closed", () => {
    expect(migration).not.toMatch(/create policy[^\n]*on storage\.objects/);
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)\s+on public\.deal_documents/);
    expect(migration).toContain("alter table public.deal_documents enable row level security");
  });
});
