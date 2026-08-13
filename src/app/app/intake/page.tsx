import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { AppHeader, AppShell } from "@/components/app/AppShell";
import { loadAccessContext } from "@/lib/auth/session";
import { readFoundationStatus } from "@/lib/config/foundation-status";
import { borrowerKinds, canCreateLoanIntake } from "@/lib/los/intake";
import { createLoanIntake } from "./actions";
import { resolveWorkspaceSurface } from "@/lib/workspace-surfaces";
import { SubmitButton } from "@/components/app/SubmitButton";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  "not-enabled": "Loan intake is installed but has not been commissioned for use.",
  "not-authorized": "Your institution role cannot create loan intake records.",
  "invalid-input": "Review the highlighted intake information and try again.",
  "command-failed": "The intake was not created. No partial loan record was accepted.",
  "invalid-response": "The intake command did not return a valid deal record.",
};

export default async function LoanIntakePage({ searchParams }: { searchParams: Promise<{ error?: string; surface?: string }> }) {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind !== "ready") redirect("/app");
  const writesEnabled = readFoundationStatus().writesEnabled;
  const permitted = canCreateLoanIntake(context.activeOrganization.role);
  const { error, surface: requestedSurface } = await searchParams;
  const surface = resolveWorkspaceSurface(requestedSurface, context.activeOrganization.role, context.workspace);

  return (
    <AppShell context={context} surface={surface}>
      <AppHeader context={context} eyebrow="Origination" title="New loan intake" />
      {!writesEnabled ? <IntakePending /> : !permitted ? <IntakeDenied /> : (
        <section className="intake-panel" aria-labelledby="intake-title">
          <div className="panel-heading"><div><p className="eyebrow">Governed creation</p><h2 id="intake-title">Borrower and request</h2></div><span>Draft application</span></div>
          {error && <p className="form-error" role="alert">{errorMessages[error] ?? "The intake could not be created."}</p>}
          <form className="intake-form" action={createLoanIntake} aria-describedby="intake-impact">
            <input type="hidden" name="idempotencyKey" value={`intake-${randomUUID()}`} />
            <p className="required-note"><span aria-hidden="true">*</span> Required fields</p>
            <fieldset><legend>Borrower</legend>
              <label>Legal name <span aria-hidden="true">*</span><input name="borrowerLegalName" autoComplete="organization" minLength={2} maxLength={200} required aria-required="true" /></label>
              <label>Borrower type<select name="borrowerKind" defaultValue="business">{borrowerKinds.map((kind) => <option key={kind} value={kind}>{label(kind)}</option>)}</select></label>
              <label>Email<input name="borrowerEmail" type="email" inputMode="email" autoComplete="email" maxLength={320} /></label>
              <label>Phone<input name="borrowerPhone" type="tel" inputMode="tel" autoComplete="tel" maxLength={50} /></label>
            </fieldset>
            <fieldset><legend>Loan request</legend>
              <label>Deal name <span aria-hidden="true">*</span><input name="dealName" minLength={2} maxLength={200} required aria-required="true" /></label>
              <label>Product type<input name="productType" maxLength={120} placeholder="Term loan, line of credit, CRE" /></label>
              <label>Requested amount <span aria-hidden="true">*</span><input name="requestedAmount" type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00" required aria-required="true" /></label>
              <label>Expected close date<input name="expectedCloseDate" type="date" /></label>
              <label className="full-field">Purpose<textarea name="purpose" maxLength={2000} rows={5} placeholder="Describe the borrower’s use of proceeds and requested structure." /></label>
            </fieldset>
            <div className="form-actions"><p id="intake-impact">Creates one borrower, draft application, intake-stage deal, assignment, and audit event. Review the legal name and requested amount before continuing.</p><SubmitButton idle="Create intake" pending="Creating governed intake…" /></div>
          </form>
        </section>
      )}
    </AppShell>
  );
}

function IntakePending() { return <section className="workspace-placeholder"><p className="eyebrow">Installed default-off</p><h2>Governed loan intake is awaiting commissioning.</h2><p>The complete intake path is implemented, but both the application flag and database execute permission remain closed until security and recovery evidence pass.</p></section>; }
function IntakeDenied() { return <section className="workspace-placeholder"><p className="eyebrow">Role boundary</p><h2>Your workspace cannot originate a new request.</h2><p>Loan intake is limited to owners, administrators, and lenders. Underwriting, closing, and read-only roles retain separation of duties.</p></section>; }
function label(value: string) { return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase()); }
