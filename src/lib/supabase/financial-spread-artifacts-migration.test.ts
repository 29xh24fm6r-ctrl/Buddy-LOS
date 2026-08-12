import { readFileSync } from "node:fs"; import { resolve } from "node:path"; import { describe,expect,it } from "vitest";
const migration=readFileSync(resolve("supabase/migrations/20260812200000_financial_spread_artifacts.sql"),"utf8").toLowerCase();
describe("financial spread artifact migration",()=>{
  it("binds spreads to tenant job and deal",()=>{ expect(migration).toContain("create table public.financial_spreads"); expect(migration).toContain("foreign key(job_id,organization_id)"); expect(migration).toContain("foreign key(deal_id,organization_id)"); });
  it("requires owner period unit lineage and evidence",()=>{ expect(migration).toContain("owner_type text not null"); expect(migration).toContain("period_end date not null"); expect(migration).toContain("derivation='calculated'"); expect(migration).toContain("jsonb_array_length(evidence)>0"); });
  it("keeps writes and certification uncommissioned",()=>{ expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)/); expect(migration).not.toContain("create function public.certify_financial_spread"); });
});
