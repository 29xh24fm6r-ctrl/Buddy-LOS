import Link from "next/link";
import type { CSSProperties } from "react";
import type { OrganizationRole } from "@/lib/auth/access-context";
import { formatMoney } from "@/components/banker/BankerCommandCenter";
import { stageLabel } from "@/lib/los/read-model";
import type { DealDetail, UnderwritingWorkspaceRecord } from "@/lib/los/queries";
import { DealDocumentWorkspace } from "./DealDocumentWorkspace";
import { UnderwriterWorkspace } from "./UnderwriterWorkspace";

export function DealCockpit({ deal, downloadsEnabled, uploadsEnabled, underwriting, runtimeEnabled, underwritingOutcome, role }: { deal: DealDetail; downloadsEnabled: boolean; uploadsEnabled: boolean; underwriting: UnderwritingWorkspaceRecord; runtimeEnabled: boolean; underwritingOutcome?: string; role: OrganizationRole }) {
  const missing = Math.max(0, deal.readiness.required - deal.readiness.satisfied);
  const awaiting = deal.readiness.documents.filter((item) => item.status !== "received" && item.status !== "reviewed").length;
  return <>
    <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/app">Banker Command Center</Link><span>›</span><span>{deal.name}</span></nav>
    <section className="deal-command-header deal-exact-header">
      <div className="deal-exact-title"><p><span>Commercial lending cockpit</span><em>Deal cockpit</em></p><h2>{deal.name}</h2></div>
      <div className="deal-exact-identity"><Fact label="Client" value={deal.borrowerName} href={`/app/borrowers/${deal.borrowerId}`} /><Fact label="Banker" value="Assigned banker" /><Fact label="Stage" value={stageLabel(deal.stage)} /></div>
      <span className="deal-exact-status">Status · Open</span>
    </section>
    <section className="deal-exact-overview" id="overview">
      <aside className="deal-readiness-ring" style={{ "--readiness": `${deal.readiness.percent}%` } as CSSProperties}><strong>{deal.readiness.percent}%</strong><span>Profile · {deal.readiness.satisfied} of {deal.readiness.required}</span></aside>
      <DealSignal label="Loan amount" value={formatMoney(deal.approvedAmount ?? deal.requestedAmount ?? 0)} note={deal.approvedAmount === null ? "Requested amount" : "Authorized amount"} tone="blue" />
      <DealSignal label="Missing fields" value={String(missing)} note={`of ${deal.readiness.required} tracked`} tone="amber" />
      <DealSignal label="Blockers" value={String(deal.readiness.exceptions)} note="Fields and document exceptions" tone="red" />
      <DealSignal label="Tasks open" value="0" note="0 completed" tone="green" />
      <DealSignal label="Awaiting receipt" value={String(awaiting)} note={`${deal.documentVersions.length} file versions`} tone="green" />
      <DealSignal label="Target close" value={deal.expectedCloseDate ?? "No date"} note={deal.expectedCloseDate ? "Governed target date" : "Not scheduled"} tone="red" />
      <footer>Last touched <strong>{deal.updatedAt.slice(0,10)}</strong> · Product <strong>{deal.productType ?? "Missing"}</strong> · Purpose <strong>{deal.purpose ?? "Missing"}</strong></footer>
    </section>
    <nav className="deal-workspace-tabs deal-exact-tabs" aria-label="Deal workspace sections"><a href="#attention">Attention</a><a href="#readiness">Stage map</a><a href="#readiness">Actions</a><a href="#underwriting">Workstreams</a><a href={`/app/borrowers/${deal.borrowerId}`}>Relationship</a><a href="#documents">Activity</a><a href="#closing">Summary</a></nav>
    <div className="deal-exact-columns">
      <section className="deal-attention-console" id="attention"><header><div><p>Attention Console</p><span>Severity-bucketed signals — derived from authorized records.</span></div><b>Potential blockers</b></header><div className="deal-attention-counts"><article data-tone="red"><strong>{deal.readiness.exceptions}</strong><span>Blocked</span></article><article data-tone="amber"><strong>{missing}</strong><span>At-risk</span></article><article><strong>{deal.readiness.readyForReview ? 1 : 0}</strong><span>Clear</span></article></div><div className="deal-missing-panel"><strong>Missing data — {missing} of {deal.readiness.required} fields</strong>{deal.readiness.checklist.filter((item) => item.status !== "completed").slice(0,5).map((item) => <span key={item.id}>{item.label}</span>)}</div>{deal.expectedCloseDate ? <p className="deal-alert-row" data-tone="amber">Target close: {deal.expectedCloseDate}</p> : <p className="deal-alert-row" data-tone="red">Target close is missing.</p>}</section>
      <aside className="deal-exact-rail"><section><header><strong>Tasks</strong><span>0</span></header><div className="honest-empty"><p>No tasks on this deal yet.</p></div></section><section><header><strong>Underwriting intake</strong><span>{deal.readiness.satisfied} of {deal.readiness.required}</span></header><p>{deal.name}</p><small>{deal.readiness.documents.length} required · {deal.documentVersions.length} file versions · {deal.readiness.exceptions} exceptions</small></section><section><header><strong>Documents</strong><span>{deal.readiness.documents.length}</span></header><a href="#documents">+ Add required document</a></section></aside>
    </div>
    <section className="operating-panel" id="readiness" aria-labelledby="readiness-title"><div className="panel-heading"><div><p className="eyebrow">Underwriting intake</p><h2 id="readiness-title">Review readiness</h2></div><span>{deal.readiness.readyForReview ? "Ready for review" : `${deal.readiness.percent}% complete`}</span></div>{deal.readiness.required === 0 ? <div className="honest-empty"><strong>No readiness requirements recorded.</strong><p>An empty checklist is not treated as complete.</p></div> : <><div className="readiness-summary"><article><span>Required</span><strong>{deal.readiness.required}</strong></article><article><span>Satisfied</span><strong>{deal.readiness.satisfied}</strong></article><article><span>Exceptions</span><strong>{deal.readiness.exceptions}</strong></article></div><div className="readiness-columns"><RequirementList title="Application checklist" items={deal.readiness.checklist} /><RequirementList title="Required documents" items={deal.readiness.documents} /></div></>}</section>
    <div id="documents"><DealDocumentWorkspace requirements={deal.readiness.documents} versions={deal.documentVersions} dealId={deal.id} downloadsEnabled={downloadsEnabled} uploadsEnabled={uploadsEnabled} /></div>
    <div id="underwriting"><UnderwriterWorkspace dealId={deal.id} versions={deal.documentVersions} role={role} moduleAccess={underwriting.moduleAccess} latestJob={underwriting.latestJob} runtimeEnabled={runtimeEnabled} outcome={underwritingOutcome} /></div>
    <section className="operating-panel closing-workspace" id="closing" aria-labelledby="closing-title"><div className="panel-heading"><div><p className="eyebrow">Closing</p><h2 id="closing-title">Closing command center</h2></div><span>{deal.expectedCloseDate ?? "No target date"}</span></div><div className="closing-grid"><article><span>Target close</span><strong>{deal.expectedCloseDate ?? "Not scheduled"}</strong></article><article><span>Approved amount</span><strong>{deal.approvedAmount === null ? "Not approved" : formatMoney(deal.approvedAmount)}</strong></article><article><span>Readiness</span><strong>{deal.readiness.readyForReview ? "Ready for review" : `${deal.readiness.percent}% complete`}</strong></article></div><p className="governed-boundary">Closing actions will appear here when the governed closing command model is installed. No stage or funding status is inferred.</p></section>
  </>;
}

function RequirementList({ title, items }: { title: string; items: DealDetail["readiness"]["checklist"] }) { return <section><h3>{title}</h3>{items.length === 0 ? <p>None recorded.</p> : <ul>{items.map((item) => <li key={item.id}><span><strong>{item.label}</strong><small>{item.category.replaceAll("_", " ")}{item.dueDate ? ` · Due ${item.dueDate}` : ""}</small></span><em data-status={item.status}>{item.status.replaceAll("_", " ")}</em></li>)}</ul>}</section>; }
function Fact({ label, value, href }: { label: string; value: string | null; href?: string }) { return <article><span>{label}</span>{value ? (href ? <Link href={href}>{value}</Link> : <strong>{value}</strong>) : <em>Missing</em>}</article>; }
function DealSignal({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) { return <article className="deal-signal" data-tone={tone}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
