"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BorrowerDirectoryRow } from "@/lib/los/read-model";
import { formatMoney } from "@/components/banker/BankerCommandCenter";
import { LosIcon } from "@/components/app/LosIcon";

const views = ["Companies", "Contacts", "Relationships", "Activities", "Vendors", "Timeline"] as const;
type CrmView = (typeof views)[number];

export function BorrowerDirectory({ rows, query }: { rows: BorrowerDirectoryRow[]; query: string }) {
  const [view, setView] = useState<CrmView>("Companies");
  const exposure = useMemo(() => rows.reduce((sum, row) => sum + row.activeExposure, 0), [rows]);
  const activeRelationships = useMemo(() => rows.filter((row) => row.activeDeals > 0).length, [rows]);
  const missingContacts = useMemo(() => rows.filter((row) => !row.primaryContact).length, [rows]);

  return (
    <section className="crm-hub" aria-label="Relationship CRM">
      <header className="crm-hub-header">
        <div><p>CRM HUB · RELATIONSHIP INTELLIGENCE</p><h1>Relationship CRM</h1><span>Manage companies, contacts, relationships, activities, and follow-ups.</span></div>
        <div><Link className="secondary-button" href="/app/deals">Open active deals</Link><Link className="primary-button" href="/app/intake">+ New deal</Link></div>
      </header>
      <div className="crm-security-rule" />

      <div className="crm-command-bar">
        <form method="get" className="crm-search"><LosIcon name="crm" /><input name="q" defaultValue={query} placeholder="Search companies, contacts, relationships…" aria-label="Search relationships" /><button type="submit">Search</button></form>
        <div className="crm-view-tabs" role="tablist" aria-label="CRM views">
          {views.map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)}>{item}{item === "Companies" && rows.length > 0 ? <small>{rows.length}</small> : null}</button>)}
        </div>
      </div>

      <div className="crm-metric-deck" aria-label="Relationship metrics">
        <CrmMetric label="Companies" value={rows.length} empty="Add companies to start" />
        <CrmMetric label="Contacts" value={rows.length - missingContacts} empty="Add people to relationships" />
        <CrmMetric label="Active relationships" value={activeRelationships} empty="Map your relationships" />
        <CrmMetric label="Active exposure" display={exposure ? formatMoney(exposure) : undefined} empty="No active exposure" />
        <CrmMetric label="Recent activity" empty="No activity logged yet" />
        <CrmMetric label="Missing contact roles" value={missingContacts} empty="Every company has a contact" attention={missingContacts > 0} />
      </div>

      <section className="crm-work-area">
        <div className="crm-work-heading"><div><p>RELATIONSHIP MASTER</p><h2>{view}</h2><span>{view === "Companies" ? `${rows.length} authorized records` : "Standalone capability not yet commissioned"}</span></div>{query ? <Link href="/app/crm">Clear search</Link> : null}</div>
        {view === "Companies" ? <CompanyTable rows={rows} /> : <UnavailableView view={view} />}
      </section>
      <footer className="crm-footer">Every relationship record shown here is tenant-scoped to your institution. Unavailable CRM domains are never fabricated.</footer>
    </section>
  );
}

function CrmMetric({ label, value, display, empty, attention }: { label: string; value?: number; display?: string; empty: string; attention?: boolean }) {
  const hasValue = display !== undefined || (value !== undefined && value > 0);
  return <article className={attention ? "attention" : ""}><span>{label}</span>{hasValue ? <strong>{display ?? value}</strong> : <em>{empty}</em>}</article>;
}

function CompanyTable({ rows }: { rows: BorrowerDirectoryRow[] }) {
  if (rows.length === 0) return <div className="crm-empty"><LosIcon name="building" /><strong>No companies yet</strong><p>Companies you manage will appear here once relationships are loaded or entered.</p></div>;
  return <div className="crm-table-wrap"><table><thead><tr><th>Company</th><th>Type</th><th>Primary contact</th><th>Active deals</th><th>Exposure</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.legalName}</strong><small>{row.externalReference ?? "No external reference"}</small></td><td>{label(row.borrowerKind)}</td><td>{row.primaryContact ?? <em>Missing</em>}</td><td>{row.activeDeals}</td><td className="crm-data">{formatMoney(row.activeExposure)}</td><td><Link href={`/app/borrowers/${row.id}`}>Open →</Link></td></tr>)}</tbody></table></div>;
}

function UnavailableView({ view }: { view: Exclude<CrmView, "Companies"> | CrmView }) {
  const copy: Record<string, string> = { Contacts: "Key people across your relationships will appear here when contact-domain reads are commissioned.", Relationships: "Connections between companies, people, and deals will appear here when relationship-domain reads are commissioned.", Activities: "Calls, meetings, notes, and follow-ups will appear here when the governed activity ledger is commissioned.", Vendors: "Approved title, appraisal, insurance, and legal vendors will appear here when vendor management is commissioned.", Timeline: "A chronological relationship timeline will appear here when governed CRM activity is commissioned." };
  return <div className="crm-empty"><LosIcon name={view === "Timeline" || view === "Activities" ? "activity" : view === "Contacts" ? "crm" : "workflow"} /><strong>No {view.toLowerCase()} yet</strong><p>{copy[view]}</p></div>;
}

function label(value: string) { return value.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "); }
