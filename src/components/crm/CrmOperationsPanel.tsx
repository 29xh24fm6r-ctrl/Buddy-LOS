import { randomUUID } from "node:crypto";
import { createCrmCompany, createCrmContact, logCrmActivity } from "@/app/app/crm/actions";
import type { BorrowerDirectoryRow } from "@/lib/los/read-model";
import type { CrmActivityRecord } from "@/lib/los/queries";

type Props = { rows: BorrowerDirectoryRow[]; activities: CrmActivityRecord[]; writesEnabled: boolean; error?: string; saved?: string };

export function CrmOperationsPanel({ rows, activities, writesEnabled, error, saved }: Props) {
  return <section className="core-operations-panel" aria-label="CRM operating controls">
    <header className="core-operations-header"><div><p className="eyebrow">Governed CRM operations</p><h2>Relationship book controls</h2></div><span className="status-chip">{writesEnabled ? "Ready" : "Read only"}</span></header>
    {error ? <p className="operation-message operation-error">The request was not completed ({error}).</p> : null}
    {saved ? <p className="operation-message operation-success">The CRM activity was saved.</p> : null}
    <div className="core-operations-grid">
      <OperationForm title="Add company" action={createCrmCompany} enabled={writesEnabled}>
        <input type="hidden" name="idempotencyKey" value={`company:${randomUUID()}`} />
        <label>Legal name<input name="legalName" minLength={2} maxLength={200} required /></label>
        <label>Borrower type<select name="borrowerKind" defaultValue="business"><option value="business">Business</option><option value="individual">Individual</option><option value="trust">Trust</option><option value="government">Government</option><option value="nonprofit">Nonprofit</option><option value="other">Other</option></select></label>
        <label>External reference<input name="externalReference" maxLength={120} /></label>
      </OperationForm>
      <OperationForm title="Add contact" action={createCrmContact} enabled={writesEnabled && rows.length > 0}>
        <input type="hidden" name="idempotencyKey" value={`contact:${randomUUID()}`} />
        <BorrowerSelect rows={rows} />
        <label>Contact type<select name="contactKind" defaultValue="email"><option value="email">Email</option><option value="phone">Phone</option><option value="address">Address</option><option value="website">Website</option><option value="other">Other</option></select></label>
        <label>Value<input name="value" required maxLength={500} /></label>
        <label>Label<input name="label" maxLength={80} /></label>
      </OperationForm>
      <OperationForm title="Log activity" action={logCrmActivity} enabled={writesEnabled && rows.length > 0}>
        <input type="hidden" name="idempotencyKey" value={`activity:${randomUUID()}`} />
        <BorrowerSelect rows={rows} />
        <label>Activity type<select name="activityKind" defaultValue="call"><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="note">Note</option><option value="referral">Referral</option><option value="other">Other</option></select></label>
        <label>Subject<input name="subject" required minLength={2} maxLength={200} /></label>
        <label>Occurred at<input name="occurredAt" type="datetime-local" required /></label>
        <label>Notes<textarea name="notes" maxLength={4000} /></label>
      </OperationForm>
    </div>
    <div className="activity-ledger"><div><p className="eyebrow">Recent activity</p><h3>Confirmed relationship interactions</h3></div>{activities.length ? <ul>{activities.slice(0,8).map(activity=><li key={activity.id}><time>{new Date(activity.occurredAt).toLocaleString()}</time><strong>{activity.kind}</strong><span>{activity.borrowerName}: {activity.subject}</span></li>)}</ul> : <p className="empty-copy">No CRM activity has been recorded yet.</p>}</div>
  </section>;
}

function BorrowerSelect({ rows }: { rows: BorrowerDirectoryRow[] }) { return <label>Company<select name="borrowerId" required defaultValue=""><option value="" disabled>Select a company</option>{rows.map(row=><option value={row.id} key={row.id}>{row.legalName}</option>)}</select></label>; }
function OperationForm({ title, action, enabled, children }: { title:string; action:(form:FormData)=>Promise<void>; enabled:boolean; children:React.ReactNode }) { return <form action={action} className="operation-form"><h3>{title}</h3>{children}<button className="button-primary" disabled={!enabled}>{enabled ? title : "Writes disabled"}</button></form>; }
