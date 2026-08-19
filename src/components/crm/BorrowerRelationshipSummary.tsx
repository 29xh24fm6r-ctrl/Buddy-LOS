import Link from "next/link";
import { formatInTimeZone } from "@/lib/los/core-operations";
import type { BorrowerDetail } from "@/lib/los/queries";

export function BorrowerRelationshipSummary({ borrower,timezone }: { borrower: BorrowerDetail;timezone:string }) {
  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/app">Command center</Link><span>/</span><span>{borrower.legalName}</span></nav>
      <section className="deal-identity"><div><p className="eyebrow">Borrower relationship</p><h2>{borrower.legalName}</h2><p>{label(borrower.borrowerKind)} · {borrower.externalReference ?? "No external reference"}</p></div></section>
      <section className="operating-panel" aria-labelledby="contact-title">
        <div className="panel-heading"><div><p className="eyebrow">CRM</p><h2 id="contact-title">Contact points</h2></div><span>{borrower.contacts.length} recorded</span></div>
        {borrower.contacts.length === 0 ? <div className="honest-empty"><strong>No contact points recorded.</strong><p>Missing relationship data is not inferred.</p></div> : (
          <div className="contact-list">{borrower.contacts.map((contact) => <article key={contact.id}><div><strong>{contact.label ?? label(contact.kind)}</strong><span>{contact.value}</span></div><small>{contact.isPrimary ? "Primary" : "Additional"} · {contact.isVerified ? "Verified" : "Not verified"}</small></article>)}</div>
        )}
      </section>
      <section className="operating-panel" aria-labelledby="relationship-record-title">
        <div className="panel-heading"><div><p className="eyebrow">Unified relationship record</p><h2 id="relationship-record-title">People, relationships, work, and opportunities</h2></div></div>
        <div className="crm-metric-grid">
          <RecordGroup title="People" empty="No active people linked." rows={borrower.people.map(row=><span key={row.id}>{row.name}{row.title?` · ${row.title}`:""}</span>)}/>
          <RecordGroup title="Relationships" empty="No relationships recorded." rows={borrower.relationships.map(row=><span key={row.id}>{row.counterpartName} · {label(row.kind)}{row.roleLabel?` · ${row.roleLabel}`:""}{row.active?" · Active":" · Ended"}</span>)}/>
          <RecordGroup title="Recent activity" empty="No activity recorded." rows={borrower.activities.map(row=><span key={row.id}>{row.subject} · {formatInTimeZone(row.occurredAt,timezone)}</span>)}/>
          <RecordGroup title="Referrals" empty="No referrals recorded." rows={borrower.referrals.map(row=><span key={row.id}>{label(row.status)} · {formatInTimeZone(row.referredAt,timezone)}</span>)}/>
          <RecordGroup title="Appointments" empty="No appointments recorded." rows={borrower.appointments.map(row=><span key={row.id}>{row.subject} · {label(row.status)} · {formatInTimeZone(row.startsAt,timezone)}</span>)}/>
          <RecordGroup title="Opportunities" empty="No opportunities recorded." rows={borrower.opportunities.map(row=><Link key={row.id} href={`/app/deals/${row.id}`}>{row.name} · {label(row.stage)}</Link>)}/>
          <RecordGroup title="Tasks" empty="No tasks recorded." rows={borrower.tasks.map(row=><Link key={row.id} href={`/app/deals/${row.dealId}`}>{row.title} · {row.dealName} · {label(row.status)}{row.dueAt?` · ${formatInTimeZone(row.dueAt,timezone)}`:""}</Link>)}/>
          <RecordGroup title="Relationship managers" empty="No active lender assignment." rows={borrower.assignments.map(row=><span key={row.userId}>{row.displayName} · {label(row.role)}</span>)}/>
        </div>
      </section>
    </>
  );
}
function RecordGroup({title,empty,rows}:{title:string;empty:string;rows:React.ReactNode[]}){return <article><strong>{title}</strong>{rows.length?rows:<span>{empty}</span>}</article>}
function label(value: string) { return value.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "); }
