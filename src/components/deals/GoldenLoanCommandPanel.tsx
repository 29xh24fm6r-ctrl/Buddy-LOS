import type { ReactNode } from "react";
import type { DealDetail, GoldenLoanWorkspaceRecord } from "@/lib/los/queries";
import { addClosingRequirement, addCreditCondition, authorizeFunding, boardDeal, certifyMemo, decideCredit, voteCredit } from "@/app/app/deals/[dealId]/lifecycle-actions";

function Hidden({ dealId, keyName }: { dealId:string; keyName:string }) { return <><input type="hidden" name="dealId" value={dealId}/><input type="hidden" name="key" value={`${keyName}:${dealId}:${crypto.randomUUID()}`}/></>; }
function FormCard({ title, children, action }:{title:string;children:ReactNode;action:(form:FormData)=>Promise<never>|Promise<void>}) { return <form action={action} className="golden-command"><strong>{title}</strong>{children}<button type="submit">Record governed command</button></form>; }

export function GoldenLoanCommandPanel({deal,lifecycle}:{deal:DealDetail;lifecycle:GoldenLoanWorkspaceRecord}) {
  const approved=lifecycle.decision?.decision==="approved"||lifecycle.decision?.decision==="approved_with_conditions";
  return <section className="golden-command-panel" aria-label="Internal golden loan factory commands">
    <header><div><p className="eyebrow">Internal factory</p><h3>Human-controlled lifecycle commands</h3></div><span>Default-off cohort</span></header>
    <div className="golden-command-grid">
      {lifecycle.memo?.status==="draft"&&<FormCard title="Certify credit memo" action={certifyMemo}><Hidden dealId={deal.id} keyName="memo"/><input type="hidden" name="memoId" value={lifecycle.memo.id}/><textarea name="statement" required minLength={8} placeholder="Certification statement"/></FormCard>}
      {lifecycle.memo?.status==="certified"&&!lifecycle.decision&&<><FormCard title="Record committee vote" action={voteCredit}><Hidden dealId={deal.id} keyName="vote"/><input type="hidden" name="memoId" value={lifecycle.memo.id}/><select name="vote" defaultValue="approve"><option value="approve">Approve</option><option value="decline">Decline</option><option value="return">Return</option><option value="abstain">Abstain</option></select><textarea name="rationale" required minLength={3} placeholder="Vote rationale"/></FormCard><FormCard title="Record human credit decision" action={decideCredit}><Hidden dealId={deal.id} keyName="decision"/><input type="hidden" name="memoId" value={lifecycle.memo.id}/><select name="decision" defaultValue="approved_with_conditions"><option value="approved">Approved</option><option value="approved_with_conditions">Approved with conditions</option><option value="declined">Declined</option><option value="returned">Returned</option></select><textarea name="rationale" required minLength={3} placeholder="Human decision rationale"/></FormCard></>}
      {approved&&lifecycle.memo&&<FormCard title="Add credit condition" action={addCreditCondition}><Hidden dealId={deal.id} keyName="condition"/><input type="hidden" name="memoId" value={lifecycle.memo.id}/><input name="description" required minLength={3} placeholder="Condition description"/><input type="datetime-local" name="dueAt"/></FormCard>}
      {approved&&<FormCard title="Add closing requirement" action={addClosingRequirement}><Hidden dealId={deal.id} keyName="closing"/><input name="title" required minLength={2} placeholder="Closing requirement"/><input type="datetime-local" name="dueAt"/></FormCard>}
      {approved&&!lifecycle.funding&&<FormCard title="Authorize funding" action={authorizeFunding}><Hidden dealId={deal.id} keyName="funding"/><input type="hidden" name="decisionId" value={lifecycle.decision?.id}/><input type="number" name="amount" min="0.01" step="0.01" required placeholder="Authorized amount"/><input name="evidence" required minLength={3} placeholder="Evidence reference"/></FormCard>}
      {lifecycle.funding&&!lifecycle.servicing&&<FormCard title="Board funded loan" action={boardDeal}><Hidden dealId={deal.id} keyName="boarding"/><input name="accountNumber" required minLength={2} placeholder="Servicing account number"/><input type="date" name="nextReviewDate"/></FormCard>}
    </div>
    <p>No command infers approval or bypasses open credit and closing conditions. Funding and boarding remain separate human acts.</p>
  </section>;
}
