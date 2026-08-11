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
      <section className="workspace-placeholder"><p className="eyebrow">Workflow</p><h2>Stage controls remain read-only.</h2><p>Underwriting, approvals, documents, closing, and funding actions will appear here only after their governed command paths are implemented and verified.</p></section>
    </>
  );
}

function Fact({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return <article><span>{label}</span>{value ? (href ? <Link href={href}>{value}</Link> : <strong>{value}</strong>) : <em>Missing</em>}</article>;
}
