import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20260811220650_trusted_document_download_exchange.sql"),
  "utf8",
).toLowerCase();

describe("trusted document download migration", () => {
  it("commissions authorization without granting object access", () => {
    expect(sql).toContain("grant execute on function public.authorize_clean_document_access");
    expect(sql).toContain("to authenticated");
    expect(sql).not.toMatch(/create policy[^;]+on storage\.objects/);
  });

  it("restricts issuance evidence to the trusted server", () => {
    expect(sql).toContain("auth.jwt()->>'role'");
    expect(sql).toContain("is distinct from 'service_role'");
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain("grant execute on function public.record_document_download_issued(bigint,integer)");
    expect(sql).toContain("to service_role");
  });

  it("binds URL issuance to the authorization lifetime and audit ledger", () => {
    expect(sql).toContain("signed url exceeds authorization lifetime");
    expect(sql).toContain("'document_access.url_issued'");
    expect(sql).toContain("'document-url-issued:'");
  });
});
