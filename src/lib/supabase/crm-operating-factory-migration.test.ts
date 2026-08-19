import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";

const sql=readFileSync(resolve("supabase/migrations/20260819120000_crm_operating_factory.sql"),"utf8").toLowerCase();
describe("CRM operating factory migration",()=>{
  it("gives standalone companies durable assignment-scoped authority",()=>{expect(sql).toContain("create table public.borrower_assignments");expect(sql).toContain("private.can_read_borrower");expect(sql).toContain("insert into public.borrower_assignments");expect(sql).toContain("alter table public.borrower_assignments enable row level security");});
  it("does not let another actor claim a replayed company command",()=>{expect(sql).toContain("e.actor_user_id=v_actor");expect(sql).toContain("company command belongs to another actor");});
  it("keeps direct writes closed",()=>{expect(sql).toContain("revoke all on public.borrower_assignments from public,anon,authenticated");expect(sql).toContain("revoke all on function public.create_crm_company");});
  it.each(["create_crm_company","create_crm_relationship","complete_deal_task"])("exposes governed %s",command=>{expect(sql).toContain("grant execute on function");expect(sql).toContain(`public.${command}(`);});
  it("serializes replay-safe commands and applies optimistic concurrency",()=>{expect(sql).toContain("pg_advisory_xact_lock");expect(sql).toContain("task version conflict");expect(sql).toContain("v_version<>p_expected_version");});
});
