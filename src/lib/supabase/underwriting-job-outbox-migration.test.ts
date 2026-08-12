import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260812180000_underwriting_job_outbox.sql"),
  "utf8",
).toLowerCase();

describe("underwriting job outbox migration", () => {
  it("creates tenant-bound jobs, immutable document evidence, and a private outbox", () => {
    expect(migration).toContain("create table public.underwriting_jobs");
    expect(migration).toContain("create table public.underwriting_job_documents");
    expect(migration).toContain("create table public.underwriting_outbox_events");
    expect(migration).toContain("foreign key (deal_id, organization_id)");
    expect(migration).toContain("foreign key (document_id, organization_id)");
    expect(migration).toContain("document.sha256");
  });

  it("requires entitlement, role, deal access, and clean documents in the command", () => {
    expect(migration).toContain("module.module_key = 'underwriting'");
    expect(migration).toContain("module.status in ('active', 'trial')");
    expect(migration).toContain("membership.role in ('owner', 'administrator', 'underwriter')");
    expect(migration).toContain("assignment.user_id = v_actor");
    expect(migration).toContain("document.security_status = 'clean'");
    expect(migration).toContain("document.deleted_at is null");
  });

  it("is idempotent and writes job, outbox, and audit evidence transactionally", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("underwriting idempotency conflict");
    expect(migration).toContain("insert into public.underwriting_jobs");
    expect(migration).toContain("insert into public.underwriting_outbox_events");
    expect(migration).toContain("insert into public.audit_events");
  });

  it("does not expose writes or a worker claim function", () => {
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)/);
    expect(migration).not.toContain("create function public.claim_underwriting");
    expect(migration).not.toContain("grant execute on function public.claim_underwriting");
    expect(migration).not.toMatch(/grant\s+select\s+on\s+public\.underwriting_outbox_events/);
  });
});
