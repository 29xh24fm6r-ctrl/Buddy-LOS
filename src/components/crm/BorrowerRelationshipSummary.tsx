import Link from "next/link";
import type { BorrowerDetail } from "@/lib/los/queries";

export function BorrowerRelationshipSummary({ borrower }: { borrower: BorrowerDetail }) {
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
    </>
  );
}
function label(value: string) { return value.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "); }
