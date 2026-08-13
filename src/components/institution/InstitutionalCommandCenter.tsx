import Link from "next/link";
import type { CSSProperties } from "react";
import type { BankerCommandCenterModel } from "@/lib/los/read-model";
import { formatMoney } from "@/components/banker/BankerCommandCenter";

export function InstitutionalCommandCenter({ model }: { model: BankerCommandCenterModel }) {
  const maxLane = Math.max(1, ...model.lanes.map((lane) => lane.deals.length));
  const approved = model.deals.filter((deal) => deal.approvedAmount !== null).length;
  const missingCloseDate = model.deals.filter((deal) => !deal.expectedCloseDate).length;
  const topDeals = [...model.deals].sort((a, b) => (b.approvedAmount ?? b.requestedAmount ?? 0) - (a.approvedAmount ?? a.requestedAmount ?? 0)).slice(0, 5);

  return <section className="institutional-command-center" aria-label="Institutional command center">
    <nav className="workspace-tabs" aria-label="Institutional views"><Link className="active" aria-current="page" href="/app">Executive overview</Link><Link href="/app/deals">Portfolio pipeline</Link><Link href="/app/deals">Team work queue</Link><Link href="/app/crm">Relationships</Link><Link href="/app">Data quality</Link></nav>
    <div className="executive-status"><div><span className="status-dot" />Institution-wide authorized view</div><span>Read-only oversight · live Supabase records</span></div>
    <section className="executive-kpis" aria-label="Executive lending metrics">
      <ExecMetric label="Active pipeline" value={formatMoney(model.totalExposure)} detail={`${model.totalActive} active deals`} tone="blue" />
      <ExecMetric label="Closing in 14 days" value={String(model.closingSoon)} detail="Current target dates" tone="green" />
      <ExecMetric label="Needs attention" value={String(model.needsAttention)} detail="Past target close date" tone={model.needsAttention ? "red" : "green"} />
      <ExecMetric label="Approved deals" value={String(approved)} detail="Approved amount recorded" tone="violet" />
      <ExecMetric label="Portfolio yield" value="Not available" detail="Pricing data not yet modeled" muted />
      <ExecMetric label="Win rate" value="Not available" detail="Outcome data not yet modeled" muted />
    </section>
    <div className="executive-grid">
      <section className="executive-card stage-distribution"><header><div><p className="eyebrow">Portfolio</p><h2>Pipeline by stage</h2></div><Link href="/app/deals">Open portfolio →</Link></header>
        {model.lanes.length === 0 ? <Empty copy="No active portfolio deals are available." /> : <div className="stage-bars">{model.lanes.map((lane) => <div key={lane.stage}><span>{lane.label}</span><div><i style={{ width: `${Math.max(6, lane.deals.length / maxLane * 100)}%` }} /></div><strong>{lane.deals.length}</strong><small>{formatMoney(lane.amount)}</small></div>)}</div>}
      </section>
      <section className="executive-card risk-card"><header><div><p className="eyebrow">Risk posture</p><h2>Portfolio attention</h2></div></header><div className="risk-score"><strong>{model.needsAttention}</strong><span>deals need attention</span></div><dl><div><dt>Past target close</dt><dd>{model.needsAttention}</dd></div><div><dt>Missing close date</dt><dd>{missingCloseDate}</dd></div><div><dt>Closing soon</dt><dd>{model.closingSoon}</dd></div></dl><p>Counts reflect recorded dates only. No predictive risk score is fabricated.</p></section>
      <section className="executive-card top-deals"><header><div><p className="eyebrow">Exposure</p><h2>Largest active deals</h2></div><Link href="/app/deals">View all</Link></header>{topDeals.length === 0 ? <Empty copy="No active deals are available." /> : <div>{topDeals.map((deal) => <Link href={`/app/deals/${deal.id}`} key={deal.id}><span><strong>{deal.name}</strong><small>{deal.borrowerName} · {deal.productType ?? "Product not recorded"}</small></span><span><strong>{formatMoney(deal.approvedAmount ?? deal.requestedAmount ?? 0)}</strong><small>{deal.stage.replaceAll("_", " ")}</small></span></Link>)}</div>}</section>
      <section className="executive-card quality-card"><header><div><p className="eyebrow">Operations health</p><h2>Data quality</h2></div></header><div className="quality-ring" style={{ "--quality": `${model.totalActive ? Math.round((model.totalActive - missingCloseDate) / model.totalActive * 100) : 0}%` } as CSSProperties}><strong>{model.totalActive ? Math.round((model.totalActive - missingCloseDate) / model.totalActive * 100) : 0}%</strong><span>close-date coverage</span></div><ul><li><span>Deals with approved amounts</span><strong>{approved} / {model.totalActive}</strong></li><li><span>Deals with target close dates</span><strong>{model.totalActive - missingCloseDate} / {model.totalActive}</strong></li></ul></section>
    </div>
  </section>;
}

function ExecMetric({ label, value, detail, tone, muted }: { label: string; value: string; detail: string; tone?: string; muted?: boolean }) { return <article className={muted ? "muted" : ""} data-tone={tone}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function Empty({ copy }: { copy: string }) { return <div className="honest-empty"><strong>Nothing to show yet.</strong><p>{copy}</p></div>; }
