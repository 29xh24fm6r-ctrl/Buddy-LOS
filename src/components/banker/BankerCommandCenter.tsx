import Link from "next/link";
import { LosIcon } from "@/components/app/LosIcon";
import type { BankerCommandCenterModel } from "@/lib/los/read-model";

export function BankerCommandCenter({ model }: { model: BankerCommandCenterModel }) {
  const emptyMetric = "Not available";
  const closingDeals = model.deals
    .filter((deal) => deal.expectedCloseDate)
    .sort((a, b) => String(a.expectedCloseDate).localeCompare(String(b.expectedCloseDate)))
    .slice(0, 4);

  return (
    <>
      <section className="banker-kpi-grid" aria-label="Banker performance snapshot">
        <Metric label="Pipeline" value={formatMoney(model.totalExposure)} detail="Active authorized deals" tone="blue" icon="$" />
        <Metric label="Weighted" value={emptyMetric} detail="Probability data not available" muted icon="W" />
        <Metric label="Active deals" value={String(model.totalActive)} detail="Authorized to your workspace" tone="blue" icon="#" />
        <Metric label="Urgent" value={String(model.needsAttention)} detail="Past target close date" tone={model.needsAttention ? "red" : "green"} icon="!" />
        <Metric label="Closing soon" value={String(model.closingSoon)} detail="Target close within 14 days" tone="amber" icon="14" />
        <Metric label="YTD closed" value={emptyMetric} detail="Close outcome data not available" muted icon="Y" />
        <Metric label="Win rate" value={emptyMetric} detail="Outcome data not available" muted icon="%" />
        <Metric label="High probability" value={emptyMetric} detail="Probability data not available" muted icon="P" />
        <Metric label="Stale 14+" value={emptyMetric} detail="Activity aging source not available" muted icon="14" />
        <Metric label="In underwriting" value={String(model.deals.filter((deal) => deal.stage === "underwriting").length)} detail="Active deals in underwriting" tone="violet" icon="UW" />
      </section>

      <nav className="workspace-tabs" aria-label="Banker workspace views">
        <Link className="active" href="/app">Dashboard</Link>
        <Link href="/app/deals">Active deals</Link>
        <Link href="/app/intake">Loan workflow</Link>
        <Link href="/app/deals">Tasks &amp; actions</Link>
        <Link href="/app/deals">Due diligence</Link>
        <Link href="/app/crm">CRM hub</Link>
        <Link href="/app/crm">Activity</Link>
        <Link href="/app/crm?view=relationships">Relationships</Link>
        <Link href="/app/deals?view=alerts">My alerts</Link>
        <Link href="/app/deals?view=alerts">Signals</Link>
      </nav>

      <h2 className="baseline-section-title">Your command center</h2>
      <p className="baseline-section-subtitle">What needs you, where your pipeline sits, and what&apos;s next.</p>

      <section className="banker-command-deck" aria-labelledby="banker-command-title">
        <header className="banker-command-deck-heading">
          <div>
            <p className="eyebrow">Your command center</p>
            <h2 id="banker-command-title">What needs you</h2>
            <p>What needs attention, where your pipeline sits, and what comes next.</p>
          </div>
          <Link href="/app/deals">Open work queue <LosIcon name="arrow" /></Link>
        </header>
        <div className="banker-command-grid">
          <div className="banker-priority-stack">
            <PriorityRow
              count={model.needsAttention}
              title="Urgent items need attention"
              detail={model.needsAttention ? "Review overdue dates, documents, and deal blockers." : "No urgent items in your authorized pipeline."}
              href="/app/deals"
              tone={model.needsAttention ? "urgent" : "clear"}
            />
            <PriorityRow
              count={model.closingSoon}
              title="Documents need due diligence"
              detail="Document requirement counts are awaiting their governed SaaS read model."
              href="/app/deals"
              tone={model.closingSoon ? "attention" : "clear"}
            />
            <PriorityRow
              count={0}
              title="Deals stale 14+ days"
              detail="Review pipeline records whose next activity is overdue."
              href="/app/deals"
              tone="unavailable"
            />
          </div>
          <aside className="portfolio-health" aria-label="Portfolio and workflow health">
            <h3>Portfolio &amp; workflow health</h3>
            <div>
              <HealthTile label="Active deals" value={String(model.totalActive)} />
              <HealthTile label="Active exposure" value={formatMoney(model.totalExposure)} />
              <HealthTile label="Closing soon" value={String(model.closingSoon)} />
              <HealthTile label="Needs attention" value={String(model.needsAttention)} />
              <HealthTile label="Documents outstanding" value="Unavailable" muted />
              <HealthTile label="Credit memos in draft" value="Unavailable" muted />
            </div>
          </aside>
        </div>
      </section>

      <div className="banker-dashboard-grid">
        <section className="operating-panel" aria-labelledby="pipeline-title">
          <div className="panel-heading">
            <div><p className="eyebrow">Personal pipeline</p><h2 id="pipeline-title">Active deals by stage</h2></div>
            <Link href="/app/deals">View all deals →</Link>
          </div>
          {model.deals.length === 0 ? <HonestEmpty copy="No active deals are assigned to this workspace." /> : (
            <div className="pipeline-lanes">
              {model.lanes.map((lane) => (
                <section className="pipeline-lane" key={lane.stage} aria-label={`Stage: ${lane.label}`}>
                  <header><div><strong>{lane.label}</strong><span>{lane.deals.length} deal{lane.deals.length === 1 ? "" : "s"}</span></div><small>{formatMoney(lane.amount)}</small></header>
                  <div>{lane.deals.map((deal) => (
                    <Link className="deal-card" href={`/app/deals/${deal.id}`} key={deal.id}>
                      <span>{deal.borrowerName}</span><strong>{deal.name}</strong>
                      <small>{deal.dealNumber ?? "No deal number"} · {formatMoney(deal.approvedAmount ?? deal.requestedAmount ?? 0)}</small>
                    </Link>
                  ))}</div>
                </section>
              ))}
            </div>
          )}
        </section>

        <aside className="banker-right-rail" aria-label="Banker priorities">
          <section>
            <header><div><span className="rail-icon amber"><LosIcon name="alert" /></span><h2>Closing soon</h2></div><Link href="/app/deals">View all</Link></header>
            {closingDeals.length === 0 ? <HonestEmpty copy="No target closing dates are currently available." /> : (
              <ul>{closingDeals.map((deal) => <li key={deal.id}><Link href={`/app/deals/${deal.id}`}><strong>{deal.name}</strong><span>{deal.borrowerName}</span><small>{deal.expectedCloseDate}</small></Link></li>)}</ul>
            )}
          </section>
          <section>
            <header><div><span className="rail-icon blue"><LosIcon name="tasks" /></span><h2>My tasks</h2></div><Link href="/app/deals">Open queue</Link></header>
            <HonestEmpty copy="Task assignments are not yet available in the native SaaS read model." />
          </section>
          <section className="quick-actions">
            <header><div><span className="rail-icon violet"><LosIcon name="workflow" /></span><h2>Quick actions</h2></div></header>
            <Link href="/app/intake">+ Start a new deal</Link>
            <Link href="/app/crm">Open CRM hub</Link>
          </section>
        </aside>
      </div>

      <div className="banker-exact-lower">
        <section className="banker-glance">
          <h2>Pipeline at a glance</h2>
          <p><strong>{model.totalActive}</strong> active deals · {formatMoney(model.totalExposure)}</p>
          {model.lanes.length ? model.lanes.map((lane) => <Link href="/app/deals" key={lane.stage}><span>{lane.label}</span><b>{lane.deals.length}</b></Link>) : <HonestEmpty copy="No active deals are assigned to this workspace." />}
        </section>
        <section className="banker-exact-health">
          <h2>Portfolio &amp; workflow health</h2>
          <div><HealthTile label="Active deals" value={String(model.totalActive)} /><HealthTile label="Documents outstanding" value="Unavailable" muted /><HealthTile label="Documents awaiting review" value="Unavailable" muted /><HealthTile label="Tasks overdue" value="0" /><HealthTile label="Credit memos in draft" value="Unavailable" muted /><HealthTile label="Closing in 14 days" value={String(model.closingSoon)} /><HealthTile label="Stale 14+ days" value="Unavailable" muted /></div>
        </section>
      </div>
      <section className="banker-activity-summary"><h2>My Activity Summary</h2><p>Workload snapshot — derived from current authorized records.</p><div><HealthTile label="Active deals" value={String(model.totalActive)} /><HealthTile label="Total pipeline" value={formatMoney(model.totalExposure)} /></div></section>
    </>
  );
}

function PriorityRow({ count, title, detail, href, tone }: { count: number; title: string; detail: string; href: string; tone: "urgent" | "attention" | "clear" | "unavailable" }) {
  return (
    <Link className="banker-priority-row" data-tone={tone} href={href}>
      <strong>{tone === "unavailable" ? "—" : count}</strong>
      <span><b>{title}</b><small>{detail}</small></span>
      <LosIcon name="arrow" />
    </Link>
  );
}

function HealthTile({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <article className={muted ? "muted" : ""}><strong>{value}</strong><span>{label}</span></article>;
}

function Metric({ label, value, detail, tone, muted, icon }: { label: string; value: string; detail: string; tone?: string; muted?: boolean; icon: string }) {
  return <article className={muted ? "muted" : ""} data-tone={tone}><div><span className="metric-icon" aria-hidden="true">{icon}</span><span>{label}</span></div><strong>{value}</strong><small>{detail}</small></article>;
}
function HonestEmpty({ copy }: { copy: string }) { return <div className="honest-empty"><strong>Nothing to show yet.</strong><p>{copy}</p></div>; }
export function formatMoney(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
