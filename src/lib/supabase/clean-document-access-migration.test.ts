import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20260811210255_clean_document_access_authorization.sql"),
  "utf8",
).toLowerCase();

describe("clean document access authorization", () => {
  it("requires scan-verified clean immutable content", () => {
    expect(sql).toContain("v_document.security_status <> 'clean'");
    expect(sql).toContain("v_document.sha256 is null");
    expect(sql).toContain("v_document.scanned_at is null");
  });

  it("requires tenant membership plus assignment or elevated role", () => {
    expect(sql).toContain("membership.organization_id = p_organization_id");
    expect(sql).toContain("membership.user_id = v_actor_user_id");
    expect(sql).toContain("membership.is_active");
    expect(sql).toContain("membership.role in ('owner', 'administrator', 'viewer')");
    expect(sql).toContain("assignment.deal_id = v_document.deal_id");
    expect(sql).toContain("assignment.ended_at is null");
  });

  it("bounds access and records an append-only authorization ledger", () => {
    expect(sql).toContain("requested_ttl_seconds between 30 and 300");
    expect(sql).toContain("insert into public.document_access_events");
    expect(sql).toContain("'document_access.authorized'");
    expect(sql).toContain("document access idempotency conflict");
    expect(sql).toContain("'expiresat'");
    expect(sql).toContain("v_existing.reason <> trim(p_reason)");
  });

  it("does not commission object access or expose a signed URL", () => {
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).not.toContain("grant execute");
    expect(sql).not.toMatch(/create policy[^;]+on storage\.objects/);
    expect(sql).not.toContain("createsignedurl");
    expect(sql).not.toContain("service_role_key");
  });
});
