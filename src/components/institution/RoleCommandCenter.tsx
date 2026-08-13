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
  const lanes = ["Overdue tasks", "Due soon tasks", "Outstanding documents", "Pending review docs", "Missing data", "Stale deals", "Blocked / at-risk", "Closing soon"];
  return <Cockpit eyebrow="Team execution" title="Team Ops Queue" subtitle="What must be worked today across the authorized team pipeline." tiles={tiles}>
    <div className="ops-lane-grid">{lanes.map((lane, index) => <QueueLane key={lane} title={lane} deals={index >= 4 ? model.deals : []} />)}</div>
  </Cockpit>;
}

function ManagerCockpit({ model }: { model: BankerCommandCenterModel }) {
  const missing = model.deals.filter((d) => !d.expectedCloseDate || (d.requestedAmount === null && d.approvedAmount === null)).length;
  const tiles: Tile[] = [
    { label: "Active deals", value: String(model.totalActive), tone: "blue" }, { label: "Pipeline amount", value: formatMoney(model.totalExposure), tone: "blue" },
    { label: "Closing 30d", value: String(model.closingSoon), tone: "green" }, { label: "Closing 30d $", value: formatMoney(model.deals.filter(d => d.expectedCloseDate).reduce((s,d)=>s+(d.approvedAmount??d.requestedAmount??0),0)), tone: "blue" },
    { label: "Blocked", value: String(model.needsAttention), tone: "red" }, { label: "At risk", value: String(model.needsAttention), tone: "amber" },
    { label: "Missing data", value: String(missing), tone: "amber" }, { label: "Stale deals", value: String(model.needsAttention), tone: "amber" },
    { label: "Outstanding docs", value: "Unavailable", muted: true }, { label: "Open tasks", value: "0", tone: "green" },
    { label: "Overdue tasks", value: "0", tone: "green" }, { label: "Avg days in stage", value: "Unavailable", muted: true },
  ];
  return <Cockpit eyebrow="Management cockpit" title="Manager Bloomberg Control Panel" subtitle="Live authorized pipeline snapshot" tiles={tiles}>
    <div className="analytics-strip"><ChartCard title="Pipeline by stage" deals={model.deals} mode="stage" /><ChartCard title="Pipeline by banker" deals={model.deals} mode="amount" /><ChartCard title="Aging — days in stage" deals={model.deals} mode="empty" /><ChartCard title="Risk distribution" deals={model.deals} mode="risk" /><ChartCard title="Open tasks by banker" deals={model.deals} mode="empty" /><ChartCard title="Outstanding docs by banker" deals={model.deals} mode="empty" /><ChartCard title="Closings forecast" deals={model.deals} mode="empty" /><ChartCard title="Missing fields" deals={model.deals} mode="missing" /><ChartCard title="Data quality" deals={model.deals} mode="quality" /></div>
    <ExceptionTape model={model} />
  </Cockpit>;
}

function PortfolioCockpit({ model }: { model: BankerCommandCenterModel }) {
  const tiles: Tile[] = [
    { label: "Boarded loans", value: String(model.totalActive), tone: "blue" }, { label: "Book exposure", value: formatMoney(model.totalExposure), tone: "blue" },
    { label: "Watchlist", value: "0", tone: "green" }, { label: "Criticized", value: "0", tone: "green" }, { label: "Classified", value: "0", tone: "green" }, { label: "Unmapped ratings", value: String(model.totalActive), tone: "amber" },
  ];
  return <Cockpit eyebrow="Portfolio cockpit" title="Portfolio Command Center" subtitle="Live boarded portfolio exposure" tiles={tiles}>
    <div className="analytics-strip portfolio-analytics"><ChartCard title="Exposure by borrower" deals={model.deals} mode="amount" /><ChartCard title="Exposure by product" deals={model.deals} mode="amount" /><ChartCard title="Exposure by risk rating" deals={model.deals} mode="risk" /><ChartCard title="Exposure by manager" deals={model.deals} mode="amount" /><ChartCard title="Loan size mix" deals={model.deals} mode="quality" /><ChartCard title="Maturity ladder" deals={model.deals} mode="empty" /></div>
    <section className="dense-table"><header><strong>Top exposures</strong><small>Showing {model.deals.length} authorized records</small></header>{model.deals.length ? model.deals.slice(0,6).map(d=><DealRow key={d.id} deal={d}/>) : <p>No boarded exposures available.</p>}</section>
    {['Book tie-out','Portfolio profitability','Regulatory classification','Regulatory Classification (Illustrative)'].map(x=><section className="collapsed-control" key={x}><strong>{x}</strong><p>Governed source data is not yet available in the native SaaS read model.</p></section>)}
  </Cockpit>;
}

function AdminCockpit({ model }: { model: BankerCommandCenterModel }) { return <ManagerCockpit model={model} />; }

function Cockpit({ eyebrow, title, subtitle, tiles, children }: { eyebrow:string; title:string; subtitle:string; tiles:Tile[]; children:React.ReactNode }) {
  return <section className="baseline-cockpit"><header><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{subtitle}</p></div><div className="cockpit-status"><span>Showing team view</span><span>Read-only</span></div></header><div className="baseline-kpi-ribbon">{tiles.map(t=><Metric key={t.label} {...t}/>)}</div>{children}</section>;
}
function Metric({label,value,tone,muted}:Tile){return <article className={muted?'muted':''} data-tone={tone}><span>{label}</span><strong>{value}</strong><Link href="/app/deals">View details →</Link></article>}
function QueueLane({title,deals}:{title:string;deals:DealSummary[]}){return <section className="queue-lane"><header><strong>{title}</strong><span>{deals.length}</span></header>{deals.length?deals.slice(0,5).map(d=><Link href={`/app/deals/${d.id}`} key={d.id}><strong>{d.name}</strong><small>{d.borrowerName} · {d.expectedCloseDate??'No date'}</small></Link>):<em>None.</em>}</section>}
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
