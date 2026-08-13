import Link from "next/link";
import { formatMoney } from "@/components/banker/BankerCommandCenter";
import type { BankerCommandCenterModel, DealSummary } from "@/lib/los/read-model";
import type { WorkspaceSurface } from "@/lib/workspace-surfaces";

type RoleSurface = Exclude<WorkspaceSurface, "banker" | "crm">;
type Tile = { label: string; value: string; tone?: string; muted?: boolean };

export function RoleCommandCenter({ surface, model }: { surface: RoleSurface; model: BankerCommandCenterModel }) {
  if (surface === "team") return <TeamCockpit model={model} />;
  if (surface === "portfolio") return <PortfolioCockpit model={model} />;
  if (surface === "admin") return <AdminCockpit model={model} />;
  return <ManagerCockpit model={model} />;
}

function TeamCockpit({ model }: { model: BankerCommandCenterModel }) {
  const stale = model.needsAttention;
  const tiles: Tile[] = [
    { label: "Active deals", value: String(model.totalActive), tone: "blue" }, { label: "Open tasks", value: "0", tone: "green" },
    { label: "Overdue tasks", value: "0", tone: "green" }, { label: "Due soon", value: "0", tone: "green" },
    { label: "Outstanding docs", value: "Unavailable", muted: true }, { label: "Pending review", value: "0", tone: "green" },
    { label: "Blocked", value: String(model.needsAttention), tone: "red" }, { label: "At risk", value: String(model.needsAttention), tone: "amber" },
    { label: "Stale deals", value: String(stale), tone: "amber" }, { label: "Closing 30d", value: String(model.closingSoon), tone: "green" },
  ];
  const lanes = [
    { title: "Overdue tasks", tone: "amber", deals: [] },
    { title: "Due soon tasks", tone: "blue", deals: [] },
    { title: "Outstanding documents", tone: "amber", deals: [] },
    { title: "Pending review docs", tone: "blue", deals: [] },
    { title: "Missing data", tone: "amber", deals: model.deals },
    { title: "Stale deals", tone: "amber", deals: model.deals },
    { title: "Blocked / at-risk", tone: "red", deals: model.deals },
    { title: "Closing soon", tone: "blue", deals: model.deals.filter((deal) => deal.expectedCloseDate) },
  ];
  return <section className="baseline-cockpit team-exact-cockpit">
    <header><div><p className="eyebrow">Team execution</p><h2>Team Ops Queue</h2><p>What must be worked today across the authorized team pipeline.</p></div><div className="cockpit-status"><span>Read-only</span></div></header>
    <div className="baseline-kpi-ribbon">{tiles.map((tile) => <Metric key={tile.label} {...tile} />)}</div>
    <div className="ops-lane-grid">{lanes.map((lane) => <QueueLane key={lane.title} {...lane} />)}</div>
  </section>;
}

function ManagerCockpit({ model }: { model: BankerCommandCenterModel }) {
  const missing = model.deals.filter((deal) => !deal.expectedCloseDate || (deal.requestedAmount === null && deal.approvedAmount === null)).length;
  const tiles: Tile[] = [
    { label: "Active deals", value: String(model.totalActive), tone: "blue" }, { label: "Pipeline amount", value: formatMoney(model.totalExposure), tone: "blue" },
    { label: "Closing 30d", value: String(model.closingSoon), tone: "green" }, { label: "Closing 30d $", value: formatMoney(model.deals.filter((deal) => deal.expectedCloseDate).reduce((sum, deal) => sum + (deal.approvedAmount ?? deal.requestedAmount ?? 0), 0)), tone: "blue" },
    { label: "Blocked", value: String(model.needsAttention), tone: "red" }, { label: "At risk", value: String(model.needsAttention), tone: "amber" },
    { label: "Missing data", value: String(missing), tone: "amber" }, { label: "Stale deals", value: String(model.needsAttention), tone: "amber" },
    { label: "Outstanding docs", value: "Unavailable", muted: true }, { label: "Open tasks", value: "0", tone: "green" },
    { label: "Overdue tasks", value: "0", tone: "green" }, { label: "Avg days in stage", value: "Unavailable", muted: true },
  ];
  const analytics = [["Pipeline by stage", "Deal count", "stage"], ["Pipeline by banker", "Deals · amount", "amount"], ["Aging — days in stage", "Deal count", "empty"], ["Risk distribution", "Blocker baseline", "risk"], ["Open tasks by banker", "Overdue highlighted", "empty"], ["Outstanding docs by banker", "", "empty"], ["Closings forecast", "Next 6 months", "empty"], ["Missing fields", "Deals · field", "missing"], ["Data quality", "Completeness buckets", "quality"]] as const;
  return <section className="manager-exact-cockpit">
    <header><div><p className="eyebrow">Management cockpit</p><h2>Manager Bloomberg Control Panel</h2><p>Live authorized pipeline snapshot</p></div><div className="cockpit-status"><span>Showing team view</span><span>Read-only</span></div></header>
    <div className="manager-exact-kpis">{tiles.map((tile) => <Metric key={tile.label} {...tile} />)}</div>
    <div className="manager-exact-analytics">{analytics.map(([title, meta, mode]) => <section className="manager-exact-chart" key={title}><header><strong>{title}</strong><small>{meta}</small></header><ManagerChartBody deals={model.deals} mode={mode} /><Link href="/app/deals">› View chart details</Link></section>)}</div>
    <ExceptionTape model={model} />
    <div className="manager-exact-tables"><ManagerSummary title="Banker workload" meta="1 banker on team" model={model} /><ManagerSummary title="Top deals by amount" meta={`Showing ${Math.min(5, model.deals.length)} of ${model.deals.length} deals`} model={model} deals /></div>
  </section>;
}

function ManagerChartBody({ deals, mode }: { deals: DealSummary[]; mode: string }) {
  const total = deals.reduce((sum, deal) => sum + (deal.approvedAmount ?? deal.requestedAmount ?? 0), 0);
  if (mode === "empty") return <em className="manager-no-data">No data yet.</em>;
  if (mode === "risk") return <div className="manager-risk-chart"><span><b>{deals.length}</b></span><ul><li>Blocked <b>{deals.length}</b></li><li>At risk <b>{deals.length}</b></li><li>Clear <b>0</b></li><li>Unknown <b>0</b></li></ul></div>;
  if (mode === "stage") return <div className="manager-stage-chart">{[...new Set(deals.map((deal) => deal.stage))].slice(0, 4).map((stage) => <div key={stage}><b>{deals.filter((deal) => deal.stage === stage).length}</b><i /><span>{stage.replaceAll("_", " ")}</span></div>)}</div>;
  const rows: [string, number][] = mode === "missing" ? [["Target close", deals.filter((deal) => !deal.expectedCloseDate).length], ["Loan amount", deals.filter((deal) => deal.requestedAmount === null && deal.approvedAmount === null).length], ["Client", 0]] : mode === "quality" ? [["Sparse (<50%)", 0], ["Partial (50–74%)", deals.length], ["Mostly populated", 0], ["Complete (100%)", 0]] : [["Assigned banker", deals.length]];
  return <div className="manager-bar-chart">{rows.map(([label, value]) => <div key={label}><span>{label}</span><i style={{ width: `${Math.max(4, value / Math.max(1, deals.length) * 82)}%` }} /><b>{mode === "amount" ? `${value} · ${formatMoney(total)}` : value}</b></div>)}</div>;
}

function ManagerSummary({ title, meta, model, deals = false }: { title: string; meta: string; model: BankerCommandCenterModel; deals?: boolean }) {
  return <section className="manager-summary-table"><header><strong>{title}</strong><small>{meta}</small></header><div className="manager-summary-head"><span>{deals ? "Client" : "Banker"}</span><span>Active deals</span><span>Pipeline $</span><span>{deals ? "Stage" : "Outstanding docs"}</span><span>{deals ? "Status" : "Blocked / at-risk"}</span></div>{deals ? model.deals.slice(0, 5).map((deal) => <Link key={deal.id} href={`/app/deals/${deal.id}`}><strong>{deal.borrowerName}</strong><span>1</span><span>{formatMoney(deal.approvedAmount ?? deal.requestedAmount ?? 0)}</span><span>{deal.stage.replaceAll("_", " ")}</span><span>{deal.expectedCloseDate ?? "No date"}</span></Link>) : <div><strong>Assigned banker</strong><span>{model.totalActive}</span><span>{formatMoney(model.totalExposure)}</span><span>—</span><span>{model.needsAttention}</span></div>}</section>;
}

function PortfolioCockpit({ model }: { model: BankerCommandCenterModel }) {
  const tiles: Tile[] = [
    { label: "Boarded loans", value: String(model.totalActive), tone: "blue" }, { label: "Book exposure", value: formatMoney(model.totalExposure), tone: "blue" },
    { label: "Watchlist", value: "0", tone: "green" }, { label: "Criticized", value: "0", tone: "green" }, { label: "Classified", value: "0", tone: "green" }, { label: "Unmapped ratings", value: String(model.totalActive), tone: "amber" },
  ];
  return <section className="baseline-cockpit portfolio-exact-cockpit">
    <header><div><p className="eyebrow">Portfolio cockpit</p><h2>Portfolio Command Center</h2><p>Live boarded portfolio exposure</p></div><div className="cockpit-status"><span>Showing team view</span><span>Read-only</span></div></header>
    <div className="baseline-kpi-ribbon">{tiles.map((tile) => <Metric key={tile.label} {...tile} />)}</div>
    {model.totalActive > 0 ? <Link className="portfolio-rating-alert" href="/app/deals">› {model.totalActive} boarded loan{model.totalActive === 1 ? "" : "s"} with an unmapped risk rating — review</Link> : null}
    <div className="analytics-strip portfolio-analytics"><ChartCard title="Exposure by borrower" deals={model.deals} mode="amount" /><ChartCard title="Exposure by product" deals={model.deals} mode="amount" /><ChartCard title="Exposure by risk rating" deals={model.deals} mode="risk" /><ChartCard title="Exposure by manager" deals={model.deals} mode="amount" /><ChartCard title="Loan size mix" deals={model.deals} mode="quality" /><ChartCard title="Maturity ladder" deals={model.deals} mode="empty" /></div>
    <section className="dense-table portfolio-exposure-table"><header><strong>Top exposures</strong><small>Showing {model.deals.length} of boarded book</small></header>{model.deals.length ? model.deals.slice(0,6).map((deal)=><Link key={deal.id} href={`/app/deals/${deal.id}`}><strong>{deal.borrowerName}</strong><span><small>Loan</small>{deal.dealNumber ?? deal.name}</span><span><small>Manager</small>Assigned banker</span><span><small>Status</small>{deal.stage.replaceAll("_", " ")}</span><span><small>Risk rating</small>Unmapped</span><span><small>Product</small>{deal.productType ?? "Unknown product"}</span><span><small>Maturity</small>{deal.expectedCloseDate ?? "Unknown"}</span><b>{formatMoney(deal.approvedAmount ?? deal.requestedAmount ?? 0)}</b></Link>) : <p>No boarded exposures available.</p>}</section>
    {['Book tie-out','Portfolio profitability','Regulatory classification','Regulatory Classification (Illustrative)'].map(x=><section className="collapsed-control" key={x}><strong>{x}</strong><p>Governed source data is not yet available in the native SaaS read model.</p></section>)}
  </section>;
}

function AdminCockpit({ model }: { model: BankerCommandCenterModel }) { return <ManagerCockpit model={model} />; }

function Metric({label,value,tone,muted}:Tile){return <article className={muted?'muted':''} data-tone={tone}><span>{label}</span><strong>{value}</strong><Link href="/app/deals">View details →</Link></article>}
function QueueLane({title,deals,tone="amber"}:{title:string;deals:DealSummary[];tone?:string}){return <section className="queue-lane" data-tone={tone}><header><strong>{title}</strong><span>{deals.length}</span></header>{deals.length?deals.slice(0,5).map(d=><Link href={`/app/deals/${d.id}`} key={d.id}><strong>{d.name}</strong><small>{d.borrowerName} · {d.expectedCloseDate??'No date'}</small></Link>):<em>None.</em>}{deals.length>5?<small className="queue-lane-more">+{deals.length-5} more on the execution board.</small>:null}</section>}
function ChartCard({ title, deals, mode }: { title: string; deals: DealSummary[]; mode: string }) {
  const groups = mode === "stage" ? [...new Set(deals.map((deal) => deal.stage))] : ["Authorized"];
  const totalAmount = deals.reduce((sum, deal) => sum + (deal.approvedAmount ?? deal.requestedAmount ?? 0), 0);
  return <section className="micro-chart"><header><strong>{title}</strong><small>View chart details →</small></header>{mode === "empty" ? <em>No data yet.</em> : groups.map((group, index) => {
    const value = mode === "amount" ? formatMoney(totalAmount) : deals.filter((deal) => mode !== "stage" || deal.stage === group).length;
    return <div className="micro-bar" key={group}><span>{group}</span><i style={{ width: `${Math.max(8, 90 - index * 15)}%` }} /><b>{value}</b></div>;
  })}</section>;
}
function ExceptionTape({model}:{model:BankerCommandCenterModel}){return <div className="exception-tape">{['Blocked','At risk','Missing fields','Stale'].map((x,i)=><section key={x} data-tone={i===0?'red':'amber'}><header><strong>{x}</strong><span>{model.needsAttention}</span></header>{model.deals.slice(0,5).map(d=><DealRow key={d.id} deal={d}/>)}</section>)}</div>}
function DealRow({deal}:{deal:DealSummary}){return <Link className="compact-deal-row" href={`/app/deals/${deal.id}`}><strong>{deal.name}</strong><small>{deal.borrowerName} · {deal.expectedCloseDate??'No date'}</small><b>{formatMoney(deal.approvedAmount??deal.requestedAmount??0)}</b></Link>}
