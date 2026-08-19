import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const queries=readFileSync("src/lib/los/queries.ts","utf8");
const actions=readFileSync("src/app/app/crm/actions.ts","utf8");
const page=readFileSync("src/app/app/crm/page.tsx","utf8");

describe("CRM workspace end-to-end contracts",()=>{
  it("lets borrower RLS be the canonical detail authorization boundary",()=>{
    const detail=queries.slice(queries.indexOf("export async function loadBorrowerDetail"),queries.indexOf("function toSummary"));
    expect(detail).toContain('.from("borrowers")');
    expect(detail).not.toContain('.from("deal_assignments")');
    expect(detail).not.toContain("dealIds.length === 0");
  });
  it("rejects mismatched company and opportunity activity input",()=>{
    expect(actions).toContain('deal.borrower_id!==borrowerId');
    expect(actions).toContain('error=company-deal-mismatch');
  });
  it("loads only the active paginated CRM view plus authoritative metrics",()=>{
    for(const loader of ["loadCrmPeople(context,page,q)","loadCrmReferrals(context,page,q)","loadCrmAppointments(context,page,q)","loadCrmMetrics(context)","loadCrmViewTotal(context,activeView,q)"])expect(page).toContain(loader);
    expect(page).toContain("loadBorrowerDeals(context,companyPage.map");
  });
  it("assigns newly created tasks to the acting operator",()=>{
    expect(actions).toContain("p_assigned_to:context.userId");
  });
});
