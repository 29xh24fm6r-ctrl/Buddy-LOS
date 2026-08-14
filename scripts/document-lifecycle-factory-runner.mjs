import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { evaluateDocumentCommissioning } from "./document-commissioning-preflight.mjs";

function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function parseEnvironment(file) {
  if (!file) return process.env;
  return Object.fromEntries(readFileSync(resolve(file), "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) return [];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return [[match[1], value.replace(/\\n/g, "\n")]];
  }));
}

function gitSha(root) {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function latestLocalMigration(root) {
  const listing = execFileSync("git", ["ls-files", "supabase/migrations/*.sql"], { cwd: root, encoding: "utf8" });
  return listing.trim().split(/\r?\n/).filter(Boolean).map(basename).sort().at(-1)?.replace(/\.sql$/, "") ?? "";
}

const root = resolve(flag("--root") ?? process.cwd());
const evidencePath = flag("--evidence");
const deploymentId = flag("--vercel-deployment-id");
const migrationHead = flag("--supabase-migration-head");

if (!evidencePath || !deploymentId || !migrationHead) {
  process.stderr.write("Required: --evidence, --vercel-deployment-id, and --supabase-migration-head. Optional: --env-file and --output.\n");
  process.exit(2);
}

const evidence = JSON.parse(readFileSync(resolve(evidencePath), "utf8"));
const expectedRelease = {
  gitSha: gitSha(root),
  vercelDeploymentId: deploymentId,
  supabaseMigrationHead: migrationHead,
};
const localMigrationHead = latestLocalMigration(root);
const result = evaluateDocumentCommissioning({
  env: parseEnvironment(flag("--env-file")),
  evidence,
  root,
  expectedRelease,
});

if (localMigrationHead !== migrationHead) {
  result.decision = "HOLD";
  result.stages.liveTested = false;
  result.stages.activated = false;
  result.holdReasons.push(`Supabase migration mismatch: repository=${localMigrationHead}, supplied-live=${migrationHead}.`);
}

const report = {
  generatedAt: new Date().toISOString(),
  expectedRelease,
  localMigrationHead,
  ...result,
};
const output = `${JSON.stringify(report, null, 2)}\n`;
const outputPath = flag("--output");
if (outputPath) writeFileSync(resolve(outputPath), output, { mode: 0o600 });
process.stdout.write(output);
process.exitCode = report.decision === "HOLD" ? 2 : 0;
