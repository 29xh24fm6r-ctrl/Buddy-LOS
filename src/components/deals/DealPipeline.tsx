import Link from "next/link";
import type { DealSummary } from "@/lib/los/read-model";
import { DEAL_STAGE_ORDER, stageLabel } from "@/lib/los/read-model";
import { formatMoney } from "@/components/banker/BankerCommandCenter";

export function DealPipeline({ deals, query, stage }: { deals: DealSummary[]; query: string; stage: string }) {
  const canonicalStages = new Set<string>(DEAL_STAGE_ORDER);
  const stages = [...DEAL_STAGE_ORDER, ...deals.map((deal) => deal.stage).filter((value) => !canonicalStages.has(value))]
    .filter((value, index, values) => values.indexOf(value) === index);
  return (
    <section className="operating-panel" aria-labelledby="deal-pipeline-title">
      <div className="panel-heading"><div><p className="eyebrow">Operating pipeline</p><h2 id="deal-pipeline-title">Active deals</h2></div><span>{deals.length} visible</span></div>
      <form className="directory-filters pipeline-filter" method="get">
        <label>Search deals<input name="q" defaultValue={query} placeholder="Deal, borrower, number, or product" /></label>
        <label>Stage<select name="stage" defaultValue={stage}><option value="">All stages</option>{stages.map((value) => <option value={value} key={value}>{stageLabel(value)}</option>)}</select></label>
        <button type="submit">Filter</button>{(query || stage) && <Link href="/app/deals">Clear</Link>}
      </form>
      {deals.length === 0 ? <div className="honest-empty"><strong>No deals match this view.</strong><p>Change the filters or create a governed loan intake when writes are commissioned.</p></div> : (
        <div className="deal-list">{deals.map((deal) => <Link href={`/app/deals/${deal.id}`} key={deal.id}>
          <span className="deal-stage-marker" aria-hidden="true" /><span><strong>{deal.name}</strong><small>{deal.borrowerName} · {deal.dealNumber ?? "No deal number"}</small></span>
          <span><small>Stage</small><strong>{stageLabel(deal.stage)}</strong></span><span><small>Exposure</small><strong>{formatMoney(deal.approvedAmount ?? deal.requestedAmount ?? 0)}</strong></span>
          <span><small>Target close</small><strong>{deal.expectedCloseDate ?? "Missing"}</strong></span>
        </Link>)}</div>
      )}
    </section>
  );
}
