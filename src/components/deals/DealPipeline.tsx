import Link from "next/link";
import type { DealSummary } from "@/lib/los/read-model";
import { DEAL_STAGE_ORDER, stageLabel } from "@/lib/los/read-model";
import { formatMoney } from "@/components/banker/BankerCommandCenter";

export function DealPipeline({ deals, query, stage, view, surface }: { deals: DealSummary[]; query: string; stage: string; view: string; surface: string }) {
  const canonicalStages = new Set<string>(DEAL_STAGE_ORDER);
  const stages = [...DEAL_STAGE_ORDER, ...deals.map((deal) => deal.stage).filter((value) => !canonicalStages.has(value))]
    .filter((value, index, values) => values.indexOf(value) === index);
  if (view !== "active") return <DealQueueView deals={deals} view={view} surface={surface} />;
  return (
    <section className="operating-panel" aria-labelledby="deal-pipeline-title">
      <div className="panel-heading"><div><p className="eyebrow">Operating pipeline</p><h2 id="deal-pipeline-title">Active deals</h2></div><span>{deals.length} visible</span></div>
      <form className="directory-filters pipeline-filter" method="get"><input type="hidden" name="surface" value={surface} /><input type="hidden" name="view" value="active" />
        <label>Search deals<input name="q" defaultValue={query} placeholder="Deal, borrower, number, or product" /></label>
        <label>Stage<select name="stage" defaultValue={stage}><option value="">All stages</option>{stages.map((value) => <option value={value} key={value}>{stageLabel(value)}</option>)}</select></label>
        <button type="submit">Filter</button>{(query || stage) && <Link href={`/app/deals?surface=${surface}&view=active`}>Clear</Link>}
      </form>
      {deals.length === 0 ? <div className="honest-empty recoverable-empty"><strong>No deals match this view.</strong><p>{query || stage ? "Clear the current search and stage filters to return to the full authorized pipeline." : "Create the first governed loan intake when you are ready."}</p><div className="empty-actions">{(query || stage) && <Link href={`/app/deals?surface=${surface}&view=active`}>Clear filters</Link>}<Link href={`/app/intake?surface=${surface}`}>Start governed intake</Link></div></div> : (
        <div className="deal-list">{deals.map((deal) => <Link href={`/app/deals/${deal.id}`} key={deal.id}>
          <span className="deal-stage-marker" aria-hidden="true" /><span><strong>{deal.name}</strong><small>{deal.borrowerName} · {deal.dealNumber ?? "No deal number"}</small></span>
          <span><small>Stage</small><strong>{stageLabel(deal.stage)}</strong></span><span><small>Exposure</small><strong>{formatMoney(deal.approvedAmount ?? deal.requestedAmount ?? 0)}</strong></span>
          <span><small>Target close</small><strong>{deal.expectedCloseDate ?? "Missing"}</strong></span>
        </Link>)}</div>
      )}
    </section>
  );
}

function DealQueueView({ deals, view, surface }: { deals: DealSummary[]; view: string; surface: string }) {
  const config = {
    alerts: { eyebrow: "Exception management", title: "My alerts", description: "Pipeline records needing immediate banker attention." },
    tasks: { eyebrow: "Operating work queue", title: "Tasks & actions", description: "Governed task assignment is not commissioned yet; deal-level actions remain accessible." },
    "due-diligence": { eyebrow: "Document control", title: "Due diligence", description: "Open a deal to review its authorized document checklist and processing status." },
  }[view] ?? { eyebrow: "Operating pipeline", title: "Active deals", description: "Authorized institution pipeline." };
  const visible = view === "alerts" ? deals.filter((deal) => !deal.expectedCloseDate || (deal.approvedAmount === null && deal.requestedAmount === null)) : deals;
  return <section className="operating-panel queue-view"><div className="panel-heading"><div><p className="eyebrow">{config.eyebrow}</p><h2>{config.title}</h2><p>{config.description}</p></div><span>{visible.length} visible</span></div>
    {visible.length === 0 ? <div className="honest-empty"><strong>{view === "alerts" ? "No current pipeline alerts." : "No authorized deals are available."}</strong><p>This surface will populate from governed institution records.</p></div> : <div className="deal-list">{visible.map((deal) => <Link href={`/app/deals/${deal.id}?surface=${surface}`} key={deal.id}><span className="deal-stage-marker" /><span><strong>{deal.name}</strong><small>{deal.borrowerName} · {deal.dealNumber ?? "No deal number"}</small></span><span><small>Stage</small><strong>{stageLabel(deal.stage)}</strong></span><span><small>Exposure</small><strong>{formatMoney(deal.approvedAmount ?? deal.requestedAmount ?? 0)}</strong></span><span><small>Next step</small><strong>Open workspace</strong></span></Link>)}</div>}
  </section>;
}
