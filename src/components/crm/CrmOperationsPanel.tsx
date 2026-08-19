import { randomUUID } from "node:crypto";
import { completeCrmTask, createCrmCompany, createCrmContact, createCrmRelationship, createCrmTask, logCrmActivity } from "@/app/app/crm/actions";
import { LocalDateTimeField } from "./LocalDateTimeField";
import type { BorrowerDirectoryRow } from "@/lib/los/read-model";
import type { DealSummary } from "@/lib/los/read-model";
import type { CrmActivityRecord, DealTaskRecord } from "@/lib/los/queries";

type Props = { rows: BorrowerDirectoryRow[]; deals:DealSummary[]; activities: CrmActivityRecord[]; tasks:DealTaskRecord[]; timezone:string; writesEnabled: boolean; error?: string; saved?: string };

export function CrmOperationsPanel({ rows, deals, activities, tasks, timezone, writesEnabled, error, saved }: Props) {
  return <section id="crm-operations" className="core-operations-panel" aria-label="CRM operating controls">
    <header className="core-operations-header"><div><p className="eyebrow">Governed CRM operations</p><h2>Relationship book controls</h2></div><span className="status-chip">{writesEnabled ? "Ready" : "Read only"}</span></header>
    {error ? <p className="operation-message operation-error">The request was not completed ({error}).</p> : null}
    {saved ? <p className="operation-message operation-success">The CRM record was saved.</p> : null}
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
        <label className="checkbox-field"><input name="isPrimary" type="checkbox" defaultChecked />Use as primary for this contact type</label>
      </OperationForm>
      <OperationForm title="Log activity" action={logCrmActivity} enabled={writesEnabled && rows.length > 0}>
        <input type="hidden" name="idempotencyKey" value={`activity:${randomUUID()}`} />
        <BorrowerSelect rows={rows} />
        <DealSelect deals={deals} optional />
        <label>Activity type<select name="activityKind" defaultValue="call"><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="note">Note</option><option value="referral">Referral</option><option value="other">Other</option></select></label>
        <label>Subject<input name="subject" required minLength={2} maxLength={200} /></label>
        <LocalDateTimeField name="occurredAt" label="Occurred at" required />
        <label>Notes<textarea name="notes" maxLength={4000} /></label>
      </OperationForm>
      <OperationForm title="Add relationship" action={createCrmRelationship} enabled={writesEnabled && rows.length > 1}>
        <input type="hidden" name="idempotencyKey" value={`relationship:${randomUUID()}`} />
        <BorrowerSelect rows={rows} name="sourceBorrowerId" label="Source company" />
        <BorrowerSelect rows={rows} name="targetBorrowerId" label="Related company" />
        <label>Relationship type<select name="relationshipKind" defaultValue="affiliate"><option value="guarantor">Guarantor</option><option value="owner">Owner</option><option value="officer">Officer</option><option value="advisor">Advisor</option><option value="vendor">Vendor</option><option value="affiliate">Affiliate</option><option value="other">Other</option></select></label>
        <label>Role label<input name="roleLabel" maxLength={120}/></label><label>Notes<textarea name="notes" maxLength={4000}/></label>
      </OperationForm>
      <OperationForm title="Create task" action={createCrmTask} enabled={writesEnabled && deals.length > 0}>
        <input type="hidden" name="idempotencyKey" value={`task:${randomUUID()}`} /><DealSelect deals={deals}/>
        <label>Title<input name="title" required minLength={2} maxLength={200}/></label><label>Description<textarea name="description" maxLength={4000}/></label><LocalDateTimeField name="dueAt" label="Due at"/>
      </OperationForm>
    </div>
    <div className="activity-ledger"><div><p className="eyebrow">Recent activity</p><h3>Confirmed relationship interactions</h3></div>{activities.length ? <ul>{activities.slice(0,8).map(activity=><li key={activity.id}><time>{formatDate(activity.occurredAt,timezone)}</time><strong>{activity.kind}</strong><span>{activity.borrowerName}: {activity.subject}</span></li>)}</ul> : <p className="empty-copy">No CRM activity has been recorded yet.</p>}</div>
    <div className="task-ledger"><div><p className="eyebrow">Work queue</p><h3>Open CRM tasks</h3></div>{tasks.filter(task=>task.status==="open").length?<ul>{tasks.filter(task=>task.status==="open").slice(0,12).map(task=><li key={task.id}><span><strong>{task.title}</strong><small>{task.dealName}{task.dueAt?` · ${formatDate(task.dueAt,timezone)}`:""}</small></span><form action={completeCrmTask}><input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="expectedVersion" value={task.version}/><input type="hidden" name="idempotencyKey" value={`task-complete:${task.id}:${task.version}`}/><button disabled={!writesEnabled}>Complete</button></form></li>)}</ul>:<p className="empty-copy">No open CRM tasks.</p>}</div>
  </section>;
}

function BorrowerSelect({ rows,name="borrowerId",label="Company" }: { rows: BorrowerDirectoryRow[];name?:string;label?:string }) { return <label>{label}<select name={name} required defaultValue=""><option value="" disabled>Select a company</option>{rows.map(row=><option value={row.id} key={row.id}>{row.legalName}</option>)}</select></label>; }
function DealSelect({deals,optional=false}:{deals:DealSummary[];optional?:boolean}){return <label>{optional?"Related opportunity (optional)":"Opportunity"}<select name="dealId" required={!optional} defaultValue=""><option value="" disabled={!optional}>{optional?"No related opportunity":"Select an opportunity"}</option>{deals.map(deal=><option value={deal.id} key={deal.id}>{deal.borrowerName} · {deal.name}</option>)}</select></label>}
function OperationForm({ title, action, enabled, children }: { title:string; action:(form:FormData)=>Promise<void>; enabled:boolean; children:React.ReactNode }) { return <form action={action} className="operation-form"><h3>{title}</h3>{children}<button className="button-primary" disabled={!enabled}>{enabled ? title : "Writes disabled"}</button></form>; }
function formatDate(value:string,timezone:string){return new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:timezone}).format(new Date(value))}
