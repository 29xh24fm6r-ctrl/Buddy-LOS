import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql=readFileSync("supabase/migrations/20260819160000_crm_completion_commissioning_factory.sql","utf8");

describe("CRM completion commissioning migration",()=>{
  it("prevents company idempotency replay from restoring revoked authority",()=>{
    const company=sql.slice(sql.indexOf("create or replace function public.create_crm_company"),sql.indexOf("create function public.assign_crm_company"));
    expect(company).toContain("return v_prior||jsonb_build_object('replayed',true)");
    expect(company).toContain("on conflict(borrower_id,user_id) do nothing");
    expect(company).not.toContain("do update set ended_at=null");
  });
  it("requires authority to every linked relationship object",()=>{
    const policy=sql.slice(sql.indexOf("create policy borrower_relationships_read_authorized"),sql.indexOf("create or replace function public.create_crm_company"));
    expect(policy).toContain("private.can_read_borrower(organization_id, source_borrower_id)");
    expect(policy).toContain("private.can_read_borrower(organization_id, target_borrower_id)");
    expect(policy).toContain("private.can_read_deal(organization_id, deal_id)");
  });
  it("adds first-class people, referrals, appointments, and lifecycle commands",()=>{
    for(const contract of ["create table public.crm_people","create table public.crm_person_company_roles","create table public.crm_referrals","create table public.crm_appointments","create function public.update_crm_company","create function public.update_deal_task","create function public.close_crm_relationship"])expect(sql).toContain(contract);
  });
  it("keeps direct writes closed and grants only governed commands",()=>{
    expect(sql).toContain("revoke all on public.crm_people, public.crm_person_company_roles, public.crm_person_contacts, public.crm_referrals, public.crm_appointments from public, anon, authenticated");
    expect(sql).toContain("grant select on public.crm_people");
    expect(sql).toContain("grant execute on function public.create_crm_company");
  });
  it("validates timezones and contact data at the database boundary",()=>{
    expect(sql).toContain("organizations_timezone_valid");
    expect(sql).toContain("private.normalize_crm_contact");
    expect(sql).toContain("create trigger borrower_contacts_prepare");
  });
});
