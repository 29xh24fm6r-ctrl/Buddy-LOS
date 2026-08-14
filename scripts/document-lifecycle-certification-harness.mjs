import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { evaluateDocumentCommissioning } from "./document-commissioning-preflight.mjs";

const DOCUMENT_GATES = [
  "BUDDY_DOCUMENT_DOWNLOADS_ENABLED",
  "BUDDY_DOCUMENT_UPLOADS_ENABLED",
  "BUDDY_DOCUMENT_SCANNING_ENABLED",
  "BUDDY_DOCUMENT_CLEANUP_ENABLED",
  "BUDDY_DOCUMENT_OPERATIONS_ENABLED",
  "NEXT_PUBLIC_BUDDY_DOCUMENTS_ENABLED",
];

function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function parseEnvironment(file) {
  const parsed = file ? Object.fromEntries(readFileSync(resolve(file), "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) return [];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value.replace(/\\n/g, "\n")]];
  })) : {};
  return { ...process.env, ...parsed };
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function latestLocalMigration(root) {
  return git(root, ["ls-files", "supabase/migrations/*.sql"])
    .split(/\r?\n/).filter(Boolean).map(basename).sort().at(-1)?.replace(/\.sql$/, "") ?? "";
}

export function evaluateExecutionBoundary({ env, evidence, organizationId }) {
  const reasons = [];
  if (evidence?.scope?.internalOnly !== true) reasons.push("Evidence is not restricted to an internal organization.");
  if (evidence?.scope?.organizationId !== organizationId) reasons.push("Requested organization does not match the evidence scope.");
  const configured = (env.BUDDY_DOCUMENTS_ORGANIZATION_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (configured.length !== 1 || configured[0] !== organizationId) reasons.push("Exactly one configured organization must match the evidence scope.");
  const unsafeGates = DOCUMENT_GATES.filter((key) => env[key] !== "false");
  if (unsafeGates.length) reasons.push(`Every Buddy LOS document gate must remain false: ${unsafeGates.join(", ")}.`);
  return { safe: reasons.length === 0, reasons };
}

function runDatabaseCertification({ root, env }) {
  if (!env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL is required for the rollback-only database certification.");
  execFileSync("psql", ["--set", "ON_ERROR_STOP=1", "--file", resolve(root, "supabase/tests/document_security_recovery.sql")], {
    cwd: root,
    env: { ...process.env, PGDATABASE: env.SUPABASE_DB_URL },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180_000,
  });
}

async function runStorageCertification({ env, organizationId }) {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const runId = randomUUID();
  const original = `${organizationId}/certification/${runId}/clean.pdf`;
  const disposed = `${organizationId}/certification-disposal/${runId}/clean.pdf`;
  const payload = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n", "utf8");
  const expectedHash = createHash("sha256").update(payload).digest("hex");
  const storage = supabase.storage.from("loan-documents");
  try {
    const uploaded = await storage.upload(original, payload, { contentType: "application/pdf", upsert: false });
    if (uploaded.error) throw new Error("Disposable upload failed.");
    const first = await storage.download(original);
    if (first.error || createHash("sha256").update(Buffer.from(await first.data.arrayBuffer())).digest("hex") !== expectedHash) {
      throw new Error("Upload readback hash verification failed.");
    }
    const moved = await storage.move(original, disposed);
    if (moved.error) throw new Error("Disposable move failed.");
    const disposedReadback = await storage.download(disposed);
    if (disposedReadback.error || createHash("sha256").update(Buffer.from(await disposedReadback.data.arrayBuffer())).digest("hex") !== expectedHash) {
      throw new Error("Disposed-object readback hash verification failed.");
    }
    const restored = await storage.move(disposed, original);
    if (restored.error) throw new Error("Disposable restore failed.");
    const restoredReadback = await storage.download(original);
    if (restoredReadback.error || createHash("sha256").update(Buffer.from(await restoredReadback.data.arrayBuffer())).digest("hex") !== expectedHash) {
      throw new Error("Restored-object readback hash verification failed.");
    }
  } finally {
    await storage.remove([original, disposed]);
  }
}

function runSecretExposureCertification({ root, env }) {
  const secretNames = ["SUPABASE_SECRET_KEY", "BUDDY_DOCUMENT_SCANNER_API_KEY", "BUDDY_DOCUMENT_SCANNER_WEBHOOK_SECRET", "CRON_SECRET"];
  const secrets = secretNames.map((name) => env[name]).filter((value) => (value?.length ?? 0) >= 16);
  if (!secrets.length) throw new Error("No sensitive values were available for the exposure scan.");
  const tracked = git(root, ["ls-files", "-z"]).split("\0").filter(Boolean);
  const exposed = [];
  for (const relative of tracked) {
    const file = resolve(root, relative);
    if (!existsSync(file) || statSync(file).size > 2_000_000) continue;
    let contents;
    try { contents = readFileSync(file, "utf8"); } catch { continue; }
    if (secrets.some((secret) => contents.includes(secret))) exposed.push(relative);
  }
  if (exposed.length) throw new Error(`Sensitive values appear in tracked files: ${exposed.join(", ")}.`);
}

function writeReport(path, report) {
  if (path) writeFileSync(resolve(path), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  const root = resolve(flag("--root") ?? process.cwd());
  const evidencePath = flag("--evidence");
  const outputPath = flag("--output");
  const organizationId = flag("--organization-id");
  const deploymentId = flag("--vercel-deployment-id");
  const migrationHead = flag("--supabase-migration-head");
  if (!evidencePath || !outputPath || !organizationId || !deploymentId || !migrationHead) {
    throw new Error("Required: --evidence, --output, --organization-id, --vercel-deployment-id, and --supabase-migration-head.");
  }
  const env = parseEnvironment(flag("--env-file"));
  const evidence = JSON.parse(readFileSync(resolve(evidencePath), "utf8"));
  const boundary = evaluateExecutionBoundary({ env, evidence, organizationId });
  const expectedRelease = { gitSha: git(root, ["rev-parse", "HEAD"]), vercelDeploymentId: deploymentId, supabaseMigrationHead: migrationHead };
  const localMigrationHead = latestLocalMigration(root);
  const plan = {
    contractVersion: "buddy-document-lifecycle-certification.v1",
    mode: hasFlag("--execute") ? "execute" : "plan",
    generatedAt: new Date().toISOString(),
    organizationId,
    expectedRelease,
    localMigrationHead,
    boundary,
    mutations: "Disposable storage object only; database test is transactionally rolled back; document feature gates remain false.",
  };
  if (!hasFlag("--execute")) {
    writeReport(outputPath, { ...plan, decision: boundary.safe && localMigrationHead === migrationHead ? "READY_TO_EXECUTE" : "HOLD" });
    process.stdout.write(`${JSON.stringify({ decision: boundary.safe && localMigrationHead === migrationHead ? "READY_TO_EXECUTE" : "HOLD", output: resolve(outputPath) })}\n`);
    return;
  }
  if (!boundary.safe || localMigrationHead !== migrationHead) {
    writeReport(outputPath, { ...plan, decision: "HOLD", holdReasons: [...boundary.reasons, ...(localMigrationHead === migrationHead ? [] : ["Repository and supplied live migration heads differ."])] });
    process.exitCode = 2;
    return;
  }

  const checks = {};
  const failures = [];
  try {
    runDatabaseCertification({ root, env });
    Object.assign(checks, { tenantIsolation: true, callbackReplayAndTamper: true, scannerOutageAndLeaseRecovery: true, auditRowsInspected: true });
  } catch (error) { failures.push(error.message); }
  try {
    await runStorageCertification({ env, organizationId });
    Object.assign(checks, { uploadReadbackAndHash: true, disposalMoveAndRestore: true });
  } catch (error) { failures.push(error.message); }
  checks.cleanAndRejectedCallbacks = evidence?.scannerCertification?.cleanResult === "clean" && evidence?.scannerCertification?.eicarResult === "rejected";
  if (!checks.cleanAndRejectedCallbacks) failures.push("Private scanner clean/rejected certification evidence is incomplete.");
  try { runSecretExposureCertification({ root, env }); checks.secretExposureScan = true; } catch (error) { failures.push(error.message); }

  const certifiedEvidence = { ...evidence, release: expectedRelease, liveTests: checks };
  const evaluation = evaluateDocumentCommissioning({ env, evidence: certifiedEvidence, root, expectedRelease });
  const report = { ...plan, decision: failures.length ? "HOLD" : evaluation.decision, failures, evidence: certifiedEvidence, evaluation };
  writeReport(outputPath, report);
  process.stdout.write(`${JSON.stringify({ decision: report.decision, output: resolve(outputPath), checks })}\n`);
  process.exitCode = report.decision === "HOLD" ? 2 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
