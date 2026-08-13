import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql=readFileSync(resolve("supabase/migrations/20260813120000_governed_core_operations.sql"),"utf8").toLowerCase();
describe("governed core operations migration",()=>{
  it.each(["crm_activities","deal_tasks"])("enables RLS and closes direct writes on %s",(table)=>{expect(sql).toContain(`alter table public.${table} enable row level security`);expect(sql).toContain("revoke all on public.crm_activities, public.deal_tasks from public, anon, authenticated");});
  it.each(["create_crm_company","create_crm_contact","log_crm_activity","create_deal_task","transition_deal_stage"])("exposes only a governed %s command",(command)=>{expect(sql).toContain(`grant execute on function public.${command}`);});
  it("requires active operator membership and tenant-bound records",()=>{expect(sql).toContain("m.is_active");expect(sql).toContain("v_role not in ('owner', 'administrator', 'lender')");expect(sql).toContain("foreign key (deal_id, organization_id)");expect(sql).toContain("foreign key (borrower_id, organization_id)");});
  it("serializes idempotency and enforces optimistic concurrency",()=>{expect(sql.match(/pg_advisory_xact_lock/g)?.length).toBe(5);expect(sql).toContain("v_version <> p_expected_version");expect(sql).toContain("deal version conflict");});
  it("limits the core lifecycle boundary",()=>{expect(sql).toContain("stage transition is not permitted in core operations");expect(sql).not.toContain("p_target_stage='credit_approval'");expect(sql).not.toContain("p_target_stage='funding'");});
});
