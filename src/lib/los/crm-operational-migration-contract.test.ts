import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync("supabase/migrations/20260819201045_crm_operational_completion_factory.sql","utf8");

describe("CRM operational completion migration",()=>{
  it("exposes governed lifecycle commands only to authenticated operators",()=>{
    for(const command of ["update_crm_person","create_crm_person_contact","update_crm_referral","update_crm_appointment"]){
      expect(migration).toContain(`create function public.${command}`);
      expect(migration).toContain(`public.${command}(`);
    }
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
    expect(migration.match(/security definer set search_path = ''/g)).toHaveLength(4);
  });

  it("requires borrower-scoped authorization, idempotency, and audit events",()=>{
    expect(migration.match(/private\.require_borrower_operator/g)).toHaveLength(4);
    expect(migration.match(/pg_advisory_xact_lock/g)).toHaveLength(4);
    expect(migration.match(/insert into public\.audit_events/g)).toHaveLength(4);
  });

  it("removes authenticated direct borrower mutation grants and covers CRM foreign keys",()=>{
    expect(migration).toContain("revoke insert, update, delete on public.borrowers from authenticated");
    expect(migration.match(/create index if not exists/g)?.length).toBeGreaterThanOrEqual(18);
  });
});
