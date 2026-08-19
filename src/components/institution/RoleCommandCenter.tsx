import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney } from "@/components/banker/BankerCommandCenter";
import type { BankerCommandCenterModel, DealSummary } from "@/lib/los/read-model";
import { boardedPortfolioDeals, closesWithinDays, dealProfileCompleteness, isPastTargetClose, missingDealFacts } from "@/lib/los/operational-facts";
import type { WorkspaceSurface } from "@/lib/workspace-surfaces";
import type { FoundationStatus } from "@/lib/config/foundation-status";
import type { AccessContext } from "@/lib/auth/access-context";

type RoleSurface = Exclude<WorkspaceSurface, "banker" | "crm">;
type Tile = { label: string; value: string; tone?: string; muted?: boolean };

export function RoleCommandCenter({ surface, model, foundationStatus, context }: { surface: RoleSurface; model: BankerCommandCenterModel; foundationStatus: FoundationStatus; context: Extract<AccessContext, { kind: "ready" }> }) {
  if (surface === "team") return <TeamCockpit model={model} />;
  if (surface === "portfolio") return <PortfolioCockpit model={model} />;
  if (surface === "admin") return <AdminCockpit status={foundationStatus} context={context} />;
  return <ManagerCockpit model={model} />;
}

function TeamCockpit({ model }: { model: BankerCommandCenterModel }) {
  const missingClose = model.deals.filter((deal) => !deal.expectedCloseDate);
  const missingAmount = model.deals.filter((deal) => deal.requestedAmount === null && deal.approvedAmount === null);
  const pastClose = model.deals.filter((deal) => isPastTargetClose(deal));
  const closingSoon = model.deals.filter((deal) => closesWithinDays(deal, 30));
  const tiles: Tile[] = [
    { label: "Active deals", value: String(model.totalActive), tone: "blue" },
    { label: "Pipeline amount", value: formatMoney(model.totalExposure), tone: "blue" },
    { label: "Past target close", value: String(pastClose.length), tone: pastClose.length ? "red" : "green" },
    { label: "Missing target close", value: String(missingClose.length), tone: missingClose.length ? "amber" : "green" },
    { label: "Missing amount", value: String(missingAmount.length), tone: missingAmount.length ? "amber" : "green" },
    { label: "Closing 30d", value: String(closingSoon.length), tone: "green" },
    { label: "Open tasks", value: "Unavailable", muted: true },
    { label: "Overdue tasks", value: "Unavailable", muted: true },
    { label: "Outstanding docs", value: "Unavailable", muted: true },
    { label: "Pending review", value: "Unavailable", muted: true },
  ];
  const lanes = [
    { title: "Past target close", tone: "red", deals: pastClose },
    { title: "Missing target close", tone: "amber", deals: missingClose },
    { title: "Missing loan amount", tone: "amber", deals: missingAmount },
    { title: "Closing within 30 days", tone: "blue", deals: closingSoon },
  ];
  return <section className="baseline-cockpit team-exact-cockpit">
    <header><div><p className="eyebrow">Team execution</p><h2>Team Ops Queue</h2><p>Stored facts across the authorized team pipeline. Unavailable authorities are labeled explicitly.</p></div><div className="cockpit-status"><span>Read-only</span></div></header>
    <div className="baseline-kpi-ribbon">{tiles.map((tile) => <Metric key={tile.label} {...tile} />)}</div>
    <div className="ops-lane-grid">{lanes.map((lane) => <QueueLane key={lane.title} {...lane} />)}</div>
  </section>;
}

function ManagerCockpit({ model }: { model: BankerCommandCenterModel }) {
  const pastClose = model.deals.filter((deal) => isPastTargetClose(deal));
  const missing = model.deals.filter((deal) => missingDealFacts(deal).length > 0);
  const closingSoon = model.deals.filter((deal) => closesWithinDays(deal, 30));
  const closingSoonAmount = closingSoon.reduce((sum, deal) => sum + (deal.approvedAmount ?? deal.requestedAmount ?? 0), 0);
  const tiles: Tile[] = [
    { label: "Active deals", value: String(model.totalActive), tone: "blue" },
    { label: "Pipeline amount", value: formatMoney(model.totalExposure), tone: "blue" },
    { label: "Closing 30d", value: String(closingSoon.length), tone: "green" },
    { label: "Closing 30d $", value: formatMoney(closingSoonAmount), tone: "blue" },
    { label: "Past target close", value: String(pastClose.length), tone: pastClose.length ? "red" : "green" },
    { label: "Missing data", value: String(missing.length), tone: missing.length ? "amber" : "green" },
    { label: "Risk classification", value: "Unavailable", muted: true },
    { label: "Outstanding docs", value: "Unavailable", muted: true },
    { label: "Open tasks", value: "Unavailable", muted: true },
    { label: "Avg days in stage", value: "Unavailable", muted: true },
  ];
  return <section className="manager-exact-cockpit">
    <header><div><p className="eyebrow">Management cockpit</p><h2>Manager Bloomberg Control Panel</h2><p>Live authorized pipeline snapshot using durable native records only.</p></div><div className="cockpit-status"><span>Showing authorized view</span><span>Read-only</span></div></header>
    <div className="manager-exact-kpis">{tiles.map((tile) => <Metric key={tile.label} {...tile} />)}</div>
    <div className="manager-exact-analytics">
      <ChartPanel title="Pipeline by stage" meta="Deal count"><StageChart deals={model.deals} /></ChartPanel>
      <ChartPanel title="Authorized pipeline" meta="Deals · amount"><SingleBar label="Authorized" count={model.deals.length} value={formatMoney(model.totalExposure)} /></ChartPanel>
      <ChartPanel title="Missing fields" meta="Deals · field"><MissingFactsChart deals={model.deals} /></ChartPanel>
      <ChartPanel title="Data quality" meta="Stored-field completeness"><QualityChart deals={model.deals} /></ChartPanel>
      <UnavailableChart title="Aging — days in stage" />
      <UnavailableChart title="Risk distribution" />
      <UnavailableChart title="Open tasks by banker" />
      <UnavailableChart title="Outstanding docs by banker" />
    </div>
    <ExceptionTape deals={model.deals} />
    <div className="manager-exact-tables"><ManagerSummary title="Authorized workload" meta="Current authorized view" model={model} /><ManagerSummary title="Top deals by amount" meta={`Showing ${Math.min(5, model.deals.length)} of ${model.deals.length} deals`} model={model} deals /></div>
  </section>;
}

function PortfolioCockpit({ model }: { model: BankerCommandCenterModel }) {
  const deals = boardedPortfolioDeals(model.deals);
  const exposure = deals.reduce((sum, deal) => sum + (deal.approvedAmount ?? deal.requestedAmount ?? 0), 0);
  const tiles: Tile[] = [
    { label: "Boarded loans", value: String(deals.length), tone: "blue" },
    { label: "Book exposure", value: formatMoney(exposure), tone: "blue" },
    { label: "Watchlist", value: "Unavailable", muted: true },
    { label: "Criticized", value: "Unavailable", muted: true },
    { label: "Classified", value: "Unavailable", muted: true },
    { label: "Risk ratings", value: "Unavailable", muted: true },
  ];
  return <section className="baseline-cockpit portfolio-exact-cockpit">
    <header><div><p className="eyebrow">Portfolio cockpit</p><h2>Portfolio Command Center</h2><p>Boarded portfolio exposure only; pipeline deals are excluded.</p></div><div className="cockpit-status"><span>Showing authorized view</span><span>Read-only</span></div></header>
    <div className="baseline-kpi-ribbon">{tiles.map((tile) => <Metric key={tile.label} {...tile} />)}</div>
    <div className="analytics-strip portfolio-analytics"><ChartCard title="Total boarded exposure" deals={deals} /><UnavailableMicroChart title="Exposure by risk rating" /><UnavailableMicroChart title="Exposure by manager" /><UnavailableMicroChart title="Maturity ladder" /></div>
    <section className="dense-table portfolio-exposure-table"><header><strong>Top exposures</strong><small>Showing {deals.length} boarded records</small></header>{deals.length ? deals.slice(0, 6).map((deal) => <Link key={deal.id} href={`/app/deals/${deal.id}`}><strong>{deal.borrowerName}</strong><span><small>Loan</small>{deal.dealNumber ?? deal.name}</span><span><small>Manager</small>Not loaded</span><span><small>Status</small>{deal.stage.replaceAll("_", " ")}</span><span><small>Risk rating</small>Not loaded</span><span><small>Product</small>{deal.productType ?? "Missing"}</span><span><small>Target / review date</small>{deal.expectedCloseDate ?? "Missing"}</span><b>{formatMoney(deal.approvedAmount ?? deal.requestedAmount ?? 0)}</b></Link>) : <p>No authorized boarded exposures available.</p>}</section>
    {['Book tie-out', 'Portfolio profitability', 'Regulatory classification'].map((title) => <section className="collapsed-control" key={title}><strong>{title}</strong><p>Governed source data is not yet available in the native SaaS read model.</p></section>)}
  </section>;
}

function AdminCockpit({ status, context }: { status: FoundationStatus; context: Extract<AccessContext, { kind: "ready" }> }) {
  const capabilities = [
    ["Identity & authentication", status.authEnabled, "Supabase identity and session boundary"],
    ["Authorized data reads", status.readsEnabled, "Organization-scoped operating views"],
    ["Governed data writes", status.writesEnabled, "Application runtime flag; database activation is independently required"],
    ["Private documents", status.documentsEnabled, "Application runtime flag; database activation is independently required"],
    ["External integrations", status.integrationsEnabled, "Separately commissioned provider connections"],
  ] as const;
  const enabledCount = capabilities.filter(([, enabled]) => enabled).length;
  return <section className="admin-control-center">
    <header><div><p className="eyebrow">Institution administration</p><h2>Admin Control Center</h2><p>Governed access, capability commissioning, and operational readiness.</p></div><div className="cockpit-status"><span>Owner view</span><span>Read-only</span></div></header>
    <div className="admin-summary-ribbon">
      <article data-tone="blue"><span>Institution</span><strong>{context.activeOrganization.organizationName}</strong><small>{context.activeOrganization.institutionType ?? "Institution type not set"}</small></article>
      <article data-tone="green"><span>Signed-in role</span><strong>{context.activeOrganization.role}</strong><small>Role-scoped workspaces</small></article>
      <article data-tone="blue"><span>Memberships</span><strong>{context.memberships.length}</strong><small>Authorized organizations</small></article>
      <article data-tone={enabledCount === capabilities.length ? "green" : "amber"}><span>Runtime flags</span><strong>{enabledCount} of {capabilities.length}</strong><small>Flags do not imply database activation</small></article>
    </div>
    <div className="admin-control-grid">
      <section className="admin-control-panel"><header><div><p className="eyebrow">Platform commissioning</p><h3>Capability gates</h3></div><span>{enabledCount === capabilities.length ? "Configured" : "Controlled rollout"}</span></header><div className="admin-capability-list">{capabilities.map(([label, active, detail]) => <article key={label} data-active={active}><i aria-hidden="true" /><div><strong>{label}</strong><small>{detail}</small></div><b>{active ? "Flag enabled" : "Default-off"}</b></article>)}</div></section>
      <section className="admin-control-panel"><header><div><p className="eyebrow">Access governance</p><h3>Institution authority</h3></div><span>Supabase-backed</span></header><dl className="admin-authority-list"><div><dt>Organization ID</dt><dd>{context.activeOrganization.organizationId}</dd></div><div><dt>Organization slug</dt><dd>{context.activeOrganization.organizationSlug}</dd></div><div><dt>Active role</dt><dd>{context.activeOrganization.role}</dd></div><div><dt>Workspace policy</dt><dd>Role and assignment scoped</dd></div></dl><p className="admin-control-note">Membership, assignment, entitlement, and database activation remain authoritative in Supabase.</p></section>
    </div>
    <div className="admin-boundary-grid">
      <section><p className="eyebrow">Optional product module</p><h3>Buddy Underwriter</h3><strong>Separately entitled and activated</strong><p>Document intelligence and underwriting remain independently sellable and organization-scoped.</p></section>
      <section><p className="eyebrow">Release boundary</p><h3>Production activation</h3><strong>Evidence controlled</strong><p>Deployment and entitlement do not activate database commands.</p></section>
      <section><p className="eyebrow">Operational safety</p><h3>Fail-closed controls</h3><strong>Database enforced</strong><p>Unavailable authorities remain visibly unavailable; the interface does not invent operational values.</p></section>
    </div>
  </section>;
}

function ChartPanel({ title, meta, children }: { title: string; meta: string; children: ReactNode }) { return <section className="manager-exact-chart"><header><strong>{title}</strong><small>{meta}</small></header>{children}<Link href="/app/deals">› View chart details</Link></section>; }
function UnavailableChart({ title }: { title: string }) { return <ChartPanel title={title} meta="Authority unavailable"><em className="manager-no-data">Not available in the current read model.</em></ChartPanel>; }
function StageChart({ deals }: { deals: DealSummary[] }) { const stages = [...new Set(deals.map((deal) => deal.stage))]; return stages.length ? <div className="manager-stage-chart">{stages.slice(0, 6).map((stage) => <div key={stage}><b>{deals.filter((deal) => deal.stage === stage).length}</b><i /><span>{stage.replaceAll("_", " ")}</span></div>)}</div> : <em className="manager-no-data">No authorized deals.</em>; }
function SingleBar({ label, count, value }: { label: string; count: number; value: string }) { return <div className="manager-bar-chart"><div><span>{label}</span><i style={{ width: count ? "82%" : "0%" }} /><b>{count} · {value}</b></div></div>; }
function MissingFactsChart({ deals }: { deals: DealSummary[] }) { const rows = ["Target close", "Loan amount", "Product"].map((label) => [label, deals.filter((deal) => missingDealFacts(deal).includes(label)).length] as const); return <Bars rows={rows} denominator={deals.length} />; }
function QualityChart({ deals }: { deals: DealSummary[] }) { const rows = [["Sparse (<50%)", deals.filter((deal) => dealProfileCompleteness(deal) < 50).length], ["Partial (50–74%)", deals.filter((deal) => { const score = dealProfileCompleteness(deal); return score >= 50 && score < 75; }).length], ["Mostly populated (75–99%)", deals.filter((deal) => { const score = dealProfileCompleteness(deal); return score >= 75 && score < 100; }).length], ["Complete", deals.filter((deal) => dealProfileCompleteness(deal) === 100).length]] as const; return <Bars rows={rows} denominator={deals.length} />; }
function Bars({ rows, denominator }: { rows: readonly (readonly [string, number])[]; denominator: number }) { return <div className="manager-bar-chart">{rows.map(([label, value]) => <div key={label}><span>{label}</span><i style={{ width: `${denominator ? value / denominator * 82 : 0}%` }} /><b>{value}</b></div>)}</div>; }
function ExceptionTape({ deals }: { deals: DealSummary[] }) { const groups = [{ label: "Past target close", deals: deals.filter((deal) => isPastTargetClose(deal)), tone: "red" }, { label: "Missing target close", deals: deals.filter((deal) => !deal.expectedCloseDate), tone: "amber" }, { label: "Missing amount", deals: deals.filter((deal) => deal.requestedAmount === null && deal.approvedAmount === null), tone: "amber" }, { label: "Missing product", deals: deals.filter((deal) => !deal.productType), tone: "amber" }]; return <div className="exception-tape">{groups.map((group) => <section key={group.label} data-tone={group.tone}><header><strong>{group.label}</strong><span>{group.deals.length}</span></header>{group.deals.slice(0, 5).map((deal) => <DealRow key={deal.id} deal={deal} />)}</section>)}</div>; }
function ManagerSummary({ title, meta, model, deals = false }: { title: string; meta: string; model: BankerCommandCenterModel; deals?: boolean }) { return <section className="manager-summary-table"><header><strong>{title}</strong><small>{meta}</small></header><div className="manager-summary-head"><span>{deals ? "Client" : "Scope"}</span><span>Active deals</span><span>Pipeline $</span><span>{deals ? "Stage" : "Documents"}</span><span>{deals ? "Target close" : "Tasks"}</span></div>{deals ? model.deals.slice(0, 5).map((deal) => <Link key={deal.id} href={`/app/deals/${deal.id}`}><strong>{deal.borrowerName}</strong><span>1</span><span>{formatMoney(deal.approvedAmount ?? deal.requestedAmount ?? 0)}</span><span>{deal.stage.replaceAll("_", " ")}</span><span>{deal.expectedCloseDate ?? "Missing"}</span></Link>) : <div><strong>Authorized pipeline</strong><span>{model.totalActive}</span><span>{formatMoney(model.totalExposure)}</span><span>Unavailable</span><span>Unavailable</span></div>}</section>; }
function Metric({ label, value, tone, muted }: Tile) { return <article className={muted ? "muted" : ""} data-tone={tone}><span>{label}</span><strong>{value}</strong><Link href="/app/deals">View details →</Link></article>; }
function QueueLane({ title, deals, tone = "amber" }: { title: string; deals: DealSummary[]; tone?: string }) { return <section className="queue-lane" data-tone={tone}><header><strong>{title}</strong><span>{deals.length}</span></header>{deals.length ? deals.slice(0, 5).map((deal) => <Link href={`/app/deals/${deal.id}`} key={deal.id}><strong>{deal.name}</strong><small>{deal.borrowerName} · {deal.expectedCloseDate ?? "No target close"}</small></Link>) : <em>None.</em>}</section>; }
function ChartCard({ title, deals }: { title: string; deals: DealSummary[] }) { const total = deals.reduce((sum, deal) => sum + (deal.approvedAmount ?? deal.requestedAmount ?? 0), 0); return <section className="micro-chart"><header><strong>{title}</strong><small>Stored exposure</small></header>{deals.length ? <div className="micro-bar"><span>Authorized</span><i style={{ width: "90%" }} /><b>{formatMoney(total)}</b></div> : <em>No boarded records.</em>}</section>; }
function UnavailableMicroChart({ title }: { title: string }) { return <section className="micro-chart"><header><strong>{title}</strong><small>Authority unavailable</small></header><em>Not available in the current read model.</em></section>; }
function DealRow({ deal }: { deal: DealSummary }) { return <Link className="compact-deal-row" href={`/app/deals/${deal.id}`}><strong>{deal.name}</strong><small>{deal.borrowerName} · {deal.expectedCloseDate ?? "No target close"}</small><b>{formatMoney(deal.approvedAmount ?? deal.requestedAmount ?? 0)}</b></Link>; }
