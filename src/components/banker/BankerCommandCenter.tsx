import Link from "next/link";
import type { BankerCommandCenterModel } from "@/lib/los/read-model";

export function BankerCommandCenter({ model }: { model: BankerCommandCenterModel }) {
  return (
    <>
      <section className="command-ribbon" aria-label="Command center summary">
        <Metric label="My active deals" value={String(model.totalActive)} detail="Assigned operating pipeline" />
        <Metric label="Active exposure" value={formatMoney(model.totalExposure)} detail="Approved or requested amount" />
        <Metric label="Needs attention" value={String(model.needsAttention)} detail="Past target close date" tone={model.needsAttention > 0 ? "attention" : undefined} />
        <Metric label="Closing in 14 days" value={String(model.closingSoon)} detail="Current target dates" />
      </section>

      <section className="operating-panel" aria-labelledby="pipeline-title">
        <div className="panel-heading"><div><p className="eyebrow">Personal pipeline</p><h2 id="pipeline-title">Deals by stage</h2></div><span>{model.totalActive} active</span></div>
        {model.deals.length === 0 ? <HonestEmpty copy="No active deals are assigned to this workspace." /> : (
          <div className="pipeline-lanes">
            {model.lanes.map((lane) => (
              <section className="pipeline-lane" key={lane.stage} aria-label={`Stage: ${lane.label}`}>
                <header><div><strong>{lane.label}</strong><span>{lane.deals.length} deal{lane.deals.length === 1 ? "" : "s"}</span></div><small>{formatMoney(lane.amount)}</small></header>
                <div>
                  {lane.deals.map((deal) => (
                    <Link className="deal-card" href={`/app/deals/${deal.id}`} key={deal.id}>
                      <span>{deal.borrowerName}</span><strong>{deal.name}</strong><small>{deal.dealNumber ?? "No deal number"} · {formatMoney(deal.approvedAmount ?? deal.requestedAmount ?? 0)}</small>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return <article data-tone={tone}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
function HonestEmpty({ copy }: { copy: string }) { return <div className="honest-empty"><strong>Nothing to show yet.</strong><p>{copy}</p></div>; }
export function formatMoney(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
