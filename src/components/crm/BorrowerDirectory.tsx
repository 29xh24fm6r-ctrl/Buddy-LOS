import Link from "next/link";
import type { BorrowerDirectoryRow } from "@/lib/los/read-model";
import { formatMoney } from "@/components/banker/BankerCommandCenter";

export function BorrowerDirectory({ rows, query }: { rows: BorrowerDirectoryRow[]; query: string }) {
  return (
    <section className="operating-panel" aria-labelledby="borrower-directory-title">
      <div className="panel-heading"><div><p className="eyebrow">Relationship master</p><h2 id="borrower-directory-title">Borrowers</h2></div><span>{rows.length} visible</span></div>
      <form className="directory-filters" method="get"><label>Search relationships<input name="q" defaultValue={query} placeholder="Name, type, reference, or contact" /></label><button type="submit">Search</button>{query && <Link href="/app/crm">Clear</Link>}</form>
      {rows.length === 0 ? <div className="honest-empty"><strong>No borrowers match this view.</strong><p>Missing or unauthorized relationships are never fabricated.</p></div> : (
        <div className="directory-table" role="table" aria-label="Borrower directory">
          <div className="directory-header" role="row"><span>Borrower</span><span>Primary contact</span><span>Active deals</span><span>Exposure</span></div>
          {rows.map((row) => <Link className="directory-row" role="row" href={`/app/borrowers/${row.id}`} key={row.id}>
            <span><strong>{row.legalName}</strong><small>{label(row.borrowerKind)} · {row.externalReference ?? "No reference"}</small></span>
            <span>{row.primaryContact ?? <em>Missing</em>}</span><span>{row.activeDeals}</span><span>{formatMoney(row.activeExposure)}</span>
          </Link>)}
        </div>
      )}
    </section>
  );
}
function label(value: string) { return value.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "); }
