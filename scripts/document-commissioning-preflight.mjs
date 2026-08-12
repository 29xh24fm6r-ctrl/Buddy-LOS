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

const enabled = (value) => value === "true";
const present = (value, minimum = 1) => (value?.trim().length ?? 0) >= minimum;

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
  const evidenceIdentityComplete = present(evidence?.release?.gitSha, 7)
    && present(evidence?.release?.vercelDeploymentId)
    && present(evidence?.release?.supabaseMigrationHead);
  const liveTested = configured && providerApprovalComplete && evidenceIdentityComplete && failedLiveTests.length === 0;
  const gatesEnabled = [
    "BUDDY_DOCUMENT_DOWNLOADS_ENABLED",
    "BUDDY_DOCUMENT_UPLOADS_ENABLED",
    "BUDDY_DOCUMENT_SCANNING_ENABLED",
    "BUDDY_DOCUMENT_CLEANUP_ENABLED",
    "NEXT_PUBLIC_BUDDY_DOCUMENTS_ENABLED",
  ].every((key) => enabled(env[key]));
  const approvalComplete = evidence?.activation?.authorized === true
    && present(evidence?.activation?.approvedBy)
    && present(evidence?.activation?.approvedAt);
  const activated = installed && liveTested && gatesEnabled && approvalComplete;

  const holdReasons = [];
  if (!installed) holdReasons.push(`Missing source artifacts: ${missingArtifacts.join(", ")}`);
  if (!configured) holdReasons.push(`Missing or invalid production configuration: ${missingConfiguration.join(", ")}`);
  if (!providerApprovalComplete) holdReasons.push("Scanner provider and contract approval evidence is incomplete.");
  if (!evidenceIdentityComplete) holdReasons.push("Release identity evidence is incomplete.");
  if (failedLiveTests.length) holdReasons.push(`Live tests are incomplete: ${failedLiveTests.join(", ")}`);
  if (!gatesEnabled) holdReasons.push("One or more document activation gates remain off.");
  if (!approvalComplete) holdReasons.push("Named activation approval is absent.");

  return {
    decision: activated ? "GO" : "HOLD",
    stages: { installed, configured, liveTested, activated },
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
  process.exitCode = result.decision === "GO" ? 0 : 2;
}
