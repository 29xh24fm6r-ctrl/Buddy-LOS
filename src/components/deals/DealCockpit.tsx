import Link from "next/link";
import type { DealDetail } from "@/lib/los/queries";
import { formatMoney } from "@/components/banker/BankerCommandCenter";
import { stageLabel } from "@/lib/los/read-model";

export function DealCockpit({ deal }: { deal: DealDetail }) {
  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/app">Command center</Link><span>/</span><span>{deal.name}</span></nav>
      <section className="deal-identity">
        <div><p className="eyebrow">Deal cockpit</p><h2>{deal.name}</h2><p>{deal.borrowerName} · {deal.dealNumber ?? "No deal number"}</p></div>
        <span className="stage-badge">{stageLabel(deal.stage)}</span>
      </section>
      <section className="detail-grid" aria-label="Deal facts">
        <Fact label="Borrower" value={deal.borrowerName} href={`/app/borrowers/${deal.borrowerId}`} />
        <Fact label="Product" value={deal.productType} />
        <Fact label="Requested" value={deal.requestedAmount === null ? null : formatMoney(deal.requestedAmount)} />
        <Fact label="Approved" value={deal.approvedAmount === null ? null : formatMoney(deal.approvedAmount)} />
        <Fact label="Target close" value={deal.expectedCloseDate} />
        <Fact label="Purpose" value={deal.purpose} />
      </section>
      <section className="operating-panel" aria-labelledby="readiness-title">
        <div className="panel-heading"><div><p className="eyebrow">Underwriting intake</p><h2 id="readiness-title">Review readiness</h2></div><span>{deal.readiness.readyForReview ? "Ready for review" : `${deal.readiness.percent}% complete`}</span></div>
        {deal.readiness.required === 0 ? <div className="honest-empty"><strong>No readiness requirements recorded.</strong><p>An empty checklist is not treated as complete.</p></div> : <>
          <div className="readiness-summary"><article><span>Required</span><strong>{deal.readiness.required}</strong></article><article><span>Satisfied</span><strong>{deal.readiness.satisfied}</strong></article><article><span>Exceptions</span><strong>{deal.readiness.exceptions}</strong></article></div>
          <div className="readiness-columns"><RequirementList title="Application checklist" items={deal.readiness.checklist} /><RequirementList title="Required documents" items={deal.readiness.documents} /></div>
        </>}
      </section>
      <section className="workspace-placeholder"><p className="eyebrow">Workflow</p><h2>Stage controls remain read-only.</h2><p>Underwriting, approvals, documents, closing, and funding actions will appear here only after their governed command paths are implemented and verified.</p></section>
    </>
  );
}

function RequirementList({ title, items }: { title: string; items: DealDetail["readiness"]["checklist"] }) {
  return <section><h3>{title}</h3>{items.length === 0 ? <p>None recorded.</p> : <ul>{items.map((item) => <li key={item.id}><span><strong>{item.label}</strong><small>{item.category.replaceAll("_", " ")}{item.dueDate ? ` · Due ${item.dueDate}` : ""}</small></span><em data-status={item.status}>{item.status.replaceAll("_", " ")}</em></li>)}</ul>}</section>;
}

function Fact({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return <article><span>{label}</span>{value ? (href ? <Link href={href}>{value}</Link> : <strong>{value}</strong>) : <em>Missing</em>}</article>;
}
