import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_SOURCE_ARTIFACTS = [
  "src/app/api/deals/[dealId]/documents/uploads/prepare/route.ts",
  "src/app/api/documents/[documentId]/upload/finalize/route.ts",
  "src/app/api/documents/[documentId]/download/route.ts",
  "src/app/api/internal/document-scans/submit/route.ts",
  "src/app/api/internal/document-scans/callback/route.ts",
  "src/app/api/internal/document-cleanup/route.ts",
  "supabase/tests/document_security_recovery.sql",
];

const REQUIRED_LIVE_TESTS = [
  "tenantIsolation",
  "uploadReadbackAndHash",
  "cleanAndRejectedCallbacks",
  "callbackReplayAndTamper",
  "scannerOutageAndLeaseRecovery",
  "disposalMoveAndRestore",
  "auditRowsInspected",
  "secretExposureScan",
];

const DOCUMENT_GATES = [
  "BUDDY_DOCUMENT_DOWNLOADS_ENABLED",
  "BUDDY_DOCUMENT_UPLOADS_ENABLED",
  "BUDDY_DOCUMENT_SCANNING_ENABLED",
  "BUDDY_DOCUMENT_CLEANUP_ENABLED",
  "BUDDY_DOCUMENT_OPERATIONS_ENABLED",
  "NEXT_PUBLIC_BUDDY_DOCUMENTS_ENABLED",
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const GIT_SHA = /^[0-9a-f]{40}$/i;

const enabled = (value) => value === "true";
const present = (value, minimum = 1) => (value?.trim().length ?? 0) >= minimum;
const timestamp = (value) => present(value) && Number.isFinite(Date.parse(value));
const exactly = (left, right) => left?.trim().toLowerCase() === right?.trim().toLowerCase();

function secureUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function evaluateDocumentCommissioning({
  env = process.env,
  evidence = null,
  root = process.cwd(),
} = {}) {
  const missingArtifacts = REQUIRED_SOURCE_ARTIFACTS.filter((file) => !existsSync(resolve(root, file)));
  const missingConfiguration = [];

  if (!secureUrl(env.NEXT_PUBLIC_SUPABASE_URL)) missingConfiguration.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!present(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 16)) missingConfiguration.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!present(env.SUPABASE_SECRET_KEY, 24)) missingConfiguration.push("SUPABASE_SECRET_KEY");
  if (!present(env.BUDDY_DOCUMENT_SCANNER_PROVIDER)) missingConfiguration.push("BUDDY_DOCUMENT_SCANNER_PROVIDER");
  if (!secureUrl(env.BUDDY_DOCUMENT_SCANNER_ENDPOINT)) missingConfiguration.push("BUDDY_DOCUMENT_SCANNER_ENDPOINT");
  if (!present(env.BUDDY_DOCUMENT_SCANNER_API_KEY, 16)) missingConfiguration.push("BUDDY_DOCUMENT_SCANNER_API_KEY");
  if (!secureUrl(env.BUDDY_DOCUMENT_SCANNER_CALLBACK_URL)) missingConfiguration.push("BUDDY_DOCUMENT_SCANNER_CALLBACK_URL");
  if (!present(env.BUDDY_DOCUMENT_SCANNER_WEBHOOK_SECRET, 32)) missingConfiguration.push("BUDDY_DOCUMENT_SCANNER_WEBHOOK_SECRET");
  if (!present(env.CRON_SECRET, 32)) missingConfiguration.push("CRON_SECRET");

  const installed = missingArtifacts.length === 0;
  const configured = missingConfiguration.length === 0;
  const failedLiveTests = REQUIRED_LIVE_TESTS.filter((test) => evidence?.liveTests?.[test] !== true);
  const providerApprovalComplete = present(evidence?.providerApproval?.provider)
    && present(evidence?.providerApproval?.contractOwner)
    && present(evidence?.providerApproval?.approvedAt);
  const evidenceIdentityComplete = GIT_SHA.test(evidence?.release?.gitSha ?? "")
    && present(evidence?.release?.vercelDeploymentId)
    && present(evidence?.release?.supabaseMigrationHead);
  const certifiedOrganizationId = evidence?.scope?.organizationId ?? "";
  const configuredOrganizations = (env.BUDDY_DOCUMENTS_ORGANIZATION_IDS ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const scopeComplete = UUID.test(certifiedOrganizationId)
    && configuredOrganizations.length === 1
    && exactly(configuredOrganizations[0], certifiedOrganizationId)
    && evidence?.scope?.internalOnly === true;
  const scannerCertificationComplete = SHA256.test(evidence?.scannerCertification?.imageDigest?.replace(/^sha256:/, "") ?? "")
    && GIT_SHA.test(evidence?.scannerCertification?.gitSha ?? "")
    && present(evidence?.scannerCertification?.service)
    && evidence?.scannerCertification?.privateInvokerVerified === true
    && evidence?.scannerCertification?.cleanResult === "clean"
    && evidence?.scannerCertification?.eicarResult === "rejected"
    && timestamp(evidence?.scannerCertification?.certifiedAt);
  const liveTested = configured && providerApprovalComplete && evidenceIdentityComplete
    && scopeComplete && scannerCertificationComplete && failedLiveTests.length === 0;
  const enabledGates = DOCUMENT_GATES.filter((key) => enabled(env[key]));
  const gatesEnabled = enabledGates.length === DOCUMENT_GATES.length;
  const gatesDisabled = enabledGates.length === 0;
  const approvalComplete = evidence?.activation?.authorized === true
    && present(evidence?.activation?.approvedBy)
    && present(evidence?.activation?.approvedAt)
    && exactly(evidence?.activation?.organizationId, certifiedOrganizationId);
  const readyForControlledActivation = installed && liveTested && gatesDisabled && !approvalComplete;
  const activated = installed && liveTested && gatesEnabled && approvalComplete;

  const holdReasons = [];
  if (!installed) holdReasons.push(`Missing source artifacts: ${missingArtifacts.join(", ")}`);
  if (!configured) holdReasons.push(`Missing or invalid production configuration: ${missingConfiguration.join(", ")}`);
  if (!providerApprovalComplete) holdReasons.push("Scanner provider and contract approval evidence is incomplete.");
  if (!evidenceIdentityComplete) holdReasons.push("Release identity evidence is incomplete.");
  if (!scopeComplete) holdReasons.push("Exactly one internal organization must match the certified scope.");
  if (!scannerCertificationComplete) holdReasons.push("Private scanner certification evidence is incomplete or invalid.");
  if (failedLiveTests.length) holdReasons.push(`Live tests are incomplete: ${failedLiveTests.join(", ")}`);
  if (!gatesDisabled && !gatesEnabled) holdReasons.push(`Document gates are partially enabled: ${enabledGates.join(", ")}.`);
  if (gatesEnabled && !approvalComplete) holdReasons.push("Document gates are enabled without matching named activation approval.");
  if (approvalComplete && !gatesEnabled) holdReasons.push("Activation approval is recorded but all document gates are not enabled.");

  const decision = activated ? "GO"
    : readyForControlledActivation ? "READY_FOR_CONTROLLED_ACTIVATION"
      : "HOLD";

  return {
    contractVersion: "buddy-document-lifecycle-factory.v1",
    decision,
    stages: { installed, configured, scannerCertified: scannerCertificationComplete, scoped: scopeComplete, liveTested, activated },
    certifiedOrganizationId: scopeComplete ? certifiedOrganizationId : null,
    enabledGates,
    missingArtifacts,
    missingConfiguration,
    failedLiveTests,
    holdReasons,
  };
}

function loadEvidence(argument) {
  if (!argument) return null;
  return JSON.parse(readFileSync(resolve(argument), "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidenceFlag = process.argv.indexOf("--evidence");
  const evidence = evidenceFlag >= 0 ? loadEvidence(process.argv[evidenceFlag + 1]) : null;
  const result = evaluateDocumentCommissioning({ evidence });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.decision === "HOLD" ? 2 : 0;
}
