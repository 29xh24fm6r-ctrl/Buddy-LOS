import type { OrganizationRole } from "@/lib/auth/access-context";
import type { ModuleAccessDecision } from "@/lib/modules/entitlements";
import type { DealDocumentVersion } from "@/lib/los/queries";
import { latestCleanDocumentVersions, underwritingRequestBlocked, underwritingStatusLabel, type UnderwritingJobSummary } from "@/lib/underwriting/workspace";
import { requestBuddyUnderwriting } from "@/app/app/deals/[dealId]/underwriting-actions";

const outcomeCopy: Record<string, string> = {
  requested: "The package was queued for Buddy Underwriter review.",
  "runtime-disabled": "Buddy Underwriter is installed but has not been activated.",
  "not-authorized": "Your role cannot request underwriting for this deal.",
  "invalid-request": "The underwriting package was incomplete or invalid.",
  "request-failed": "The request was not accepted. No underwriting job was created.",
};

const blockedCopy = {
  runtime_disabled: "Installed and connected. Activation remains off.",
  entitlement_required: "This institution has not subscribed to Buddy Underwriter.",
  role_required: "Only owners, administrators, and assigned underwriters can submit a package.",
  clean_documents_required: "At least one latest document version must pass security scanning.",
  job_in_progress: "The current package is already being processed.",
} as const;

export function UnderwriterWorkspace({ dealId, versions, role, moduleAccess, latestJob, runtimeEnabled, outcome }: {
  dealId: string;
  versions: DealDocumentVersion[];
  role: OrganizationRole;
  moduleAccess: ModuleAccessDecision;
  latestJob: UnderwritingJobSummary | null;
  runtimeEnabled: boolean;
  outcome?: string;
}) {
  const eligible = latestCleanDocumentVersions(versions);
  const blocked = underwritingRequestBlocked({ runtimeEnabled, entitled: moduleAccess.allowed, role, eligibleDocumentCount: eligible.length, latestStatus: latestJob?.status ?? null });
  return <section className="operating-panel underwriter-workspace" aria-labelledby="underwriter-workspace-title">
    <div className="panel-heading"><div><p className="eyebrow">Optional module</p><h2 id="underwriter-workspace-title">Buddy Underwriter</h2></div><span>{underwritingStatusLabel(latestJob?.status ?? null)}</span></div>
    <div className="underwriter-summary">
      <div><strong>Full credit underwriting</strong><p>Classifies evidence, extracts financial facts, prepares spreads, and advances governed analysis for human review.</p></div>
      <dl><div><dt>Entitlement</dt><dd>{moduleAccess.allowed ? "Active" : "Not active"}</dd></div><div><dt>Eligible documents</dt><dd>{eligible.length}</dd></div><div><dt>Latest package</dt><dd>{latestJob ? new Date(latestJob.createdAt).toLocaleDateString("en-US") : "None"}</dd></div></dl>
    </div>
    {outcome && outcomeCopy[outcome] ? <p className={`underwriter-outcome ${outcome === "requested" ? "success" : "notice"}`}>{outcomeCopy[outcome]}</p> : null}
    {latestJob?.status === "needs_review" ? <div className="underwriter-review"><strong>Analysis ready for human review</strong><p>Buddy’s output remains proposed evidence. A qualified underwriter must review and certify it before any credit decision.</p></div> : null}
    <form action={requestBuddyUnderwriting} className="underwriter-action">
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="idempotencyKey" value={`underwriting-${crypto.randomUUID()}`} />
      {eligible.map((document) => <input key={document.id} type="hidden" name="documentId" value={document.id} />)}
      <div><strong>{blocked ? blockedCopy[blocked] : "Ready to submit the latest clean document package."}</strong><small>Submitting creates an auditable job. It does not approve credit or change the deal stage.</small></div>
      <button type="submit" disabled={Boolean(blocked)}>Send to Buddy Underwriter</button>
    </form>
  </section>;
}
