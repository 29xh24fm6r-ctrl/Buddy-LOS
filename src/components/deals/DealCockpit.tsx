import Link from "next/link";
import type { OrganizationRole } from "@/lib/auth/access-context";
import { formatMoney } from "@/components/banker/BankerCommandCenter";
import { stageLabel } from "@/lib/los/read-model";
import type { DealDetail, UnderwritingWorkspaceRecord } from "@/lib/los/queries";
import { DealDocumentWorkspace } from "./DealDocumentWorkspace";
import { UnderwriterWorkspace } from "./UnderwriterWorkspace";

export function DealCockpit({ deal, downloadsEnabled, uploadsEnabled, underwriting, runtimeEnabled, underwritingOutcome, role }: { deal: DealDetail; downloadsEnabled: boolean; uploadsEnabled: boolean; underwriting: UnderwritingWorkspaceRecord; runtimeEnabled: boolean; underwritingOutcome?: string; role: OrganizationRole }) {
  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/app">Banker workspace</Link><span>›</span><Link href="/app/deals">Active deals</Link><span>›</span><span>{deal.name}</span></nav>
      <section className="deal-command-header">
        <div className="deal-command-title"><span className="deal-monogram">{deal.borrowerName.charAt(0).toUpperCase()}</span><div><p className="eyebrow">Deal command center</p><h2>{deal.name}</h2><p>{deal.borrowerName} · {deal.dealNumber ?? "No deal number"}</p></div></div>
        <div className="deal-command-actions"><span className="stage-badge">{stageLabel(deal.stage)}</span><Link className="secondary-button" href={`/app/borrowers/${deal.borrowerId}`}>Borrower profile</Link></div>
      </section>
      <nav className="deal-workspace-tabs" aria-label="Deal workspace sections"><a href="#overview">Overview</a><a href="#readiness">Workflow</a><a href="#documents">Documents</a><a href="#underwriting">Underwriting</a><a href="#closing">Closing</a></nav>

      <section className="deal-overview" id="overview">
        <section className="detail-grid" aria-label="Deal facts">
          <Fact label="Borrower" value={deal.borrowerName} href={`/app/borrowers/${deal.borrowerId}`} /><Fact label="Product" value={deal.productType} />
          <Fact label="Requested" value={deal.requestedAmount === null ? null : formatMoney(deal.requestedAmount)} /><Fact label="Approved" value={deal.approvedAmount === null ? null : formatMoney(deal.approvedAmount)} />
          <Fact label="Target close" value={deal.expectedCloseDate} /><Fact label="Purpose" value={deal.purpose} />
        </section>
        <aside className="deal-health-card"><p className="eyebrow">Deal health</p><strong>{deal.readiness.percent}%</strong><span>Review readiness</span><div><i style={{ width: `${deal.readiness.percent}%` }} /></div><dl><div><dt>Requirements</dt><dd>{deal.readiness.required}</dd></div><div><dt>Exceptions</dt><dd>{deal.readiness.exceptions}</dd></div><div><dt>Files</dt><dd>{deal.documentVersions.length}</dd></div></dl></aside>
      </section>

      <section className="operating-panel" id="readiness" aria-labelledby="readiness-title">
        <div className="panel-heading"><div><p className="eyebrow">Underwriting intake</p><h2 id="readiness-title">Review readiness</h2></div><span>{deal.readiness.readyForReview ? "Ready for review" : `${deal.readiness.percent}% complete`}</span></div>
        {deal.readiness.required === 0 ? <div className="honest-empty"><strong>No readiness requirements recorded.</strong><p>An empty checklist is not treated as complete.</p></div> : <><div className="readiness-summary"><article><span>Required</span><strong>{deal.readiness.required}</strong></article><article><span>Satisfied</span><strong>{deal.readiness.satisfied}</strong></article><article><span>Exceptions</span><strong>{deal.readiness.exceptions}</strong></article></div><div className="readiness-columns"><RequirementList title="Application checklist" items={deal.readiness.checklist} /><RequirementList title="Required documents" items={deal.readiness.documents} /></div></>}
      </section>
      <div id="documents"><DealDocumentWorkspace requirements={deal.readiness.documents} versions={deal.documentVersions} dealId={deal.id} downloadsEnabled={downloadsEnabled} uploadsEnabled={uploadsEnabled} /></div>
      <div id="underwriting"><UnderwriterWorkspace dealId={deal.id} versions={deal.documentVersions} role={role} moduleAccess={underwriting.moduleAccess} latestJob={underwriting.latestJob} runtimeEnabled={runtimeEnabled} outcome={underwritingOutcome} /></div>
      <section className="operating-panel closing-workspace" id="closing" aria-labelledby="closing-title">
        <div className="panel-heading"><div><p className="eyebrow">Closing</p><h2 id="closing-title">Closing command center</h2></div><span>{deal.expectedCloseDate ?? "No target date"}</span></div>
        <div className="closing-grid"><article><span>Target close</span><strong>{deal.expectedCloseDate ?? "Not scheduled"}</strong></article><article><span>Approved amount</span><strong>{deal.approvedAmount === null ? "Not approved" : formatMoney(deal.approvedAmount)}</strong></article><article><span>Readiness</span><strong>{deal.readiness.readyForReview ? "Ready for review" : `${deal.readiness.percent}% complete`}</strong></article></div>
        <p className="governed-boundary">Closing actions will appear here when the governed closing command model is installed. No stage or funding status is inferred.</p>
      </section>
    </>
  );
}

function RequirementList({ title, items }: { title: string; items: DealDetail["readiness"]["checklist"] }) { return <section><h3>{title}</h3>{items.length === 0 ? <p>None recorded.</p> : <ul>{items.map((item) => <li key={item.id}><span><strong>{item.label}</strong><small>{item.category.replaceAll("_", " ")}{item.dueDate ? ` · Due ${item.dueDate}` : ""}</small></span><em data-status={item.status}>{item.status.replaceAll("_", " ")}</em></li>)}</ul>}</section>; }
function Fact({ label, value, href }: { label: string; value: string | null; href?: string }) { return <article><span>{label}</span>{value ? (href ? <Link href={href}>{value}</Link> : <strong>{value}</strong>) : <em>Missing</em>}</article>; }
