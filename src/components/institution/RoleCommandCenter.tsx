import Link from "next/link";
import type { CSSProperties } from "react";
import { formatMoney } from "@/components/banker/BankerCommandCenter";
import type { BankerCommandCenterModel } from "@/lib/los/read-model";
import type { WorkspaceSurface } from "@/lib/workspace-surfaces";

const titles: Record<Exclude<WorkspaceSurface, "banker" | "crm">, { eyebrow: string; title: string; subtitle: string }> = {
  team: { eyebrow: "Team operations cockpit", title: "Team Command Center", subtitle: "Shared pipeline, bottlenecks, document needs, and task load across the team." },
  manager: { eyebrow: "Management cockpit", title: "Manager Bloomberg Control Panel", subtitle: "Live authorized pipeline snapshot." },
  portfolio: { eyebrow: "Portfolio management cockpit", title: "Portfolio Command Center", subtitle: "Authorized exposure, mix, maturity, and risk roll-up." },
  admin: { eyebrow: "Administrative cockpit", title: "Admin Command Center", subtitle: "Institution configuration, operational health, and governed access." },
};

export function RoleCommandCenter({ surface, model }: { surface: Exclude<WorkspaceSurface, "banker" | "crm">; model: BankerCommandCenterModel }) {
  const config = titles[surface];
  const missingAmount = model.deals.filter((deal) => deal.approvedAmount === null && deal.requestedAmount === null).length;
  const missingClose = model.deals.filter((deal) => !deal.expectedCloseDate).length;
  const underwriting = model.deals.filter((deal) => deal.stage === "underwriting").length;
  const max = Math.max(1, ...model.lanes.map((lane) => lane.deals.length));

  return (
    <section className="role-command-center" aria-labelledby="role-cockpit-title">
      <header>
        <div><p className="eyebrow">{config.eyebrow}</p><h2 id="role-cockpit-title">{config.title}</h2><p>{config.subtitle}</p></div>
        <div className="cockpit-status"><span>Showing institution view</span><span>Read-only</span></div>
      </header>
      <div className="management-metric-grid">
        <ManagementMetric label="Active deals" value={String(model.totalActive)} tone="blue" />
        <ManagementMetric label="Pipeline amount" value={formatMoney(model.totalExposure)} tone="blue" />
        <ManagementMetric label="Closing 14d" value={String(model.closingSoon)} tone="blue" />
        <ManagementMetric label="Needs attention" value={String(model.needsAttention)} tone={model.needsAttention ? "red" : "green"} />
        <ManagementMetric label="Missing amounts" value={String(missingAmount)} tone={missingAmount ? "amber" : "green"} />
        <ManagementMetric label="Missing close dates" value={String(missingClose)} tone={missingClose ? "amber" : "green"} />
        <ManagementMetric label="In underwriting" value={String(underwriting)} tone="violet" />
        <ManagementMetric label="Outstanding docs" value="Unavailable" muted />
        <ManagementMetric label="Open tasks" value="Unavailable" muted />
      </div>
      <div className="role-command-grid">
        <section className="executive-card stage-distribution">
          <header><div><p className="eyebrow">Authorized pipeline</p><h2>Deals by stage</h2></div><Link href={`/app/deals?surface=${surface}`}>View details →</Link></header>
          {model.lanes.length === 0 ? <EmptyState /> : <div className="stage-bars">{model.lanes.map((lane) => <div key={lane.stage}><span>{lane.label}</span><div><i style={{ width: `${Math.max(6, lane.deals.length / max * 100)}%` }} /></div><strong>{lane.deals.length}</strong><small>{formatMoney(lane.amount)}</small></div>)}</div>}
        </section>
        <section className="executive-card quality-card">
          <header><div><p className="eyebrow">Record health</p><h2>Data quality</h2></div></header>
          <div className="quality-ring" style={{ "--quality": `${model.totalActive ? Math.round((model.totalActive - missingClose) / model.totalActive * 100) : 0}%` } as CSSProperties}><strong>{model.totalActive ? Math.round((model.totalActive - missingClose) / model.totalActive * 100) : 0}%</strong><span>close-date coverage</span></div>
          <ul><li><span>Exposure recorded</span><strong>{model.totalActive - missingAmount} / {model.totalActive}</strong></li><li><span>Target close recorded</span><strong>{model.totalActive - missingClose} / {model.totalActive}</strong></li></ul>
        </section>
      </div>
    </section>
  );
}

function ManagementMetric({ label, value, tone, muted = false }: { label: string; value: string; tone?: string; muted?: boolean }) {
  return <article className={muted ? "muted" : ""} data-tone={tone}><span>{label}</span><strong>{value}</strong><Link href="/app/deals">View details →</Link></article>;
}

function EmptyState() { return <div className="honest-empty"><strong>No active pipeline records.</strong><p>The cockpit remains operational; metrics will populate from authorized Supabase records.</p></div>; }
