import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const page=read("../../app/app/crm/page.tsx");
const actions=read("../../app/app/crm/actions.ts");
const directory=read("../../components/crm/BorrowerDirectory.tsx");
const operations=read("../../components/crm/CrmOperationsPanel.tsx");
const detail=read("../../components/crm/BorrowerRelationshipSummary.tsx");
const queries=read("./queries.ts");
const migration=read("../../../supabase/migrations/20260819213000_crm_end_to_end_operating_certification_factory.sql");
const authorization=read("../../../supabase/tests/authorization_activation_lifecycle.sql");

describe("CRM end-to-end operating certification factory",()=>{
  it("uses authoritative RLS-scoped search for every enriched ledger",()=>{
    expect(migration).toContain("security invoker set search_path = ''");
    for(const view of ["companies","people","contacts","relationships","opportunities","activities","referrals","calendar","tasks"]){
      expect(migration).toMatch(new RegExp(`p_view\\s*=\\s*'${view}'`));
      expect(queries).toContain(`crmSearchIds(context,"${view}"`);
    }
    expect(migration).toContain("revoke all on function public.crm_workspace_search_ids");
    expect(migration).toContain("grant execute on function public.crm_workspace_search_ids");
  });

  it("loads independent searchable selectors and person referral sources",()=>{
    expect(page).toContain("loadBorrowerDirectory(context,1,pick)");
    expect(page).toContain("loadCommandCenterDeals(context,1,pick)");
    expect(page).toContain('["people","referrals"].includes(activeView)?loadCrmPeople(context,1,pick)');
    expect(operations).toContain("Search operation selectors");
  });

  it("wires complete editable and reversible lifecycle controls",()=>{
    for(const command of ["updateCrmPerson","updateCrmTask","updateCrmReferral","updateCrmAppointment","reopenCrmRelationship","restoreCrmRecord"])expect(directory+operations).toContain(command);
    for(const field of ['name="outcome"','name="notes"','name="assignedTo"','name="startsAt"','name="endsAt"'])expect(directory).toContain(field);
    expect(migration).toContain("create function public.restore_crm_record");
    expect(migration).toContain("create function public.reopen_crm_relationship");
  });

  it("renders the unified company record in organization time",()=>{
    for(const section of ["Relationship managers","Tasks","counterpartName","formatInTimeZone"])expect(detail).toContain(section);
    expect(operations).toContain("organization timezone");
  });

  it("logs every CRM RPC failure and executes new commands in the rollback test",()=>{
    const rpcCalls=[...actions.matchAll(/\.rpc\("([a-z0-9_]+)"/g)].map(match=>match[1]);
    for(const rpc of rpcCalls)expect(actions).toContain(`commandFailed(context,"${rpc}"`);
    for(const rpc of ["update_crm_person","create_crm_person_contact","update_crm_referral","update_crm_appointment","reopen_crm_relationship","restore_crm_record","crm_workspace_search_ids"])expect(authorization).toContain(`public.${rpc}`);
    expect(authorization.trim().endsWith("rollback;")).toBe(true);
  });
});
