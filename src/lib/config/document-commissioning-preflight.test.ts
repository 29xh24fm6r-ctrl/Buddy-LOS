import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
// The operational preflight intentionally remains directly executable Node.js.
// @ts-expect-error The adjacent executable has no public TypeScript declaration.
import { evaluateDocumentCommissioning } from "../../../scripts/document-commissioning-preflight.mjs";

const artifacts = [
  "src/app/api/deals/[dealId]/documents/uploads/prepare/route.ts",
  "src/app/api/documents/[documentId]/upload/finalize/route.ts",
  "src/app/api/documents/[documentId]/download/route.ts",
  "src/app/api/internal/document-scans/submit/route.ts",
  "src/app/api/internal/document-scans/callback/route.ts",
  "src/app/api/internal/document-cleanup/route.ts",
  "supabase/tests/document_security_recovery.sql",
];

function installedRoot() {
  const root = mkdtempSync(join(tmpdir(), "buddy-commissioning-"));
  for (const artifact of artifacts) {
    const target = join(root, artifact);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "test");
  }
  return root;
}

const configuredEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key-long-enough",
  SUPABASE_SECRET_KEY: "secret-key-that-is-long-enough",
  BUDDY_DOCUMENT_SCANNER_PROVIDER: "approved-provider",
  BUDDY_DOCUMENT_SCANNER_ENDPOINT: "https://scanner.example/submit",
  BUDDY_DOCUMENT_SCANNER_API_KEY: "scanner-api-key-long-enough",
  BUDDY_DOCUMENT_SCANNER_CALLBACK_URL: "https://buddy.example/api/internal/document-scans/callback",
  BUDDY_DOCUMENT_SCANNER_WEBHOOK_SECRET: "webhook-secret-at-least-thirty-two-characters",
  CRON_SECRET: "cron-secret-at-least-thirty-two-characters",
  BUDDY_DOCUMENTS_ORGANIZATION_IDS: "9e3f6b9b-7116-41e7-8be4-a0ff97d4bcd7",
  BUDDY_DOCUMENT_DOWNLOADS_ENABLED: "false",
  BUDDY_DOCUMENT_UPLOADS_ENABLED: "false",
  BUDDY_DOCUMENT_SCANNING_ENABLED: "false",
  BUDDY_DOCUMENT_CLEANUP_ENABLED: "false",
  BUDDY_DOCUMENT_OPERATIONS_ENABLED: "false",
  NEXT_PUBLIC_BUDDY_DOCUMENTS_ENABLED: "false",
};

const completeEvidence = {
  release: { gitSha: "1234567890abcdef1234567890abcdef12345678", vercelDeploymentId: "dpl_123", supabaseMigrationHead: "20260812000000" },
  scope: { organizationId: "9e3f6b9b-7116-41e7-8be4-a0ff97d4bcd7", internalOnly: true },
  scannerCertification: {
    gitSha: "7849ee0322ef13ad4d6917c80f3fb5dc48251c8c",
    imageDigest: `sha256:${"a".repeat(64)}`,
    service: "buddy-los-document-scanner-sandbox",
    privateInvokerVerified: true,
    cleanResult: "clean",
    eicarResult: "rejected",
    certifiedAt: "2026-08-14T18:35:37Z",
  },
  providerApproval: { provider: "approved-provider", contractOwner: "security-owner", approvedAt: "2026-08-12T11:00:00Z" },
  liveTests: {
    tenantIsolation: true,
    uploadReadbackAndHash: true,
    cleanAndRejectedCallbacks: true,
    callbackReplayAndTamper: true,
    scannerOutageAndLeaseRecovery: true,
    disposalMoveAndRestore: true,
    auditRowsInspected: true,
    secretExposureScan: true,
  },
  activation: {
    authorized: true,
    organizationId: "9e3f6b9b-7116-41e7-8be4-a0ff97d4bcd7",
    approvedBy: "release-owner",
    approvedAt: "2026-08-12T12:00:00Z",
  },
};

describe("document commissioning preflight", () => {
  it("fails closed without configuration or evidence", () => {
    const result = evaluateDocumentCommissioning({ env: {}, evidence: null, root: installedRoot() });
    expect(result.decision).toBe("HOLD");
    expect(result.stages).toMatchObject({ installed: true, configured: false, liveTested: false, activated: false });
    expect(result.missingConfiguration).toContain("SUPABASE_SECRET_KEY");
  });

  it("does not confuse complete configuration with live certification", () => {
    const result = evaluateDocumentCommissioning({ env: configuredEnv, evidence: null, root: installedRoot() });
    expect(result.stages).toMatchObject({ configured: true, liveTested: false, activated: false });
    expect(result.decision).toBe("HOLD");
  });

  it("requires every feature gate to be explicitly configured", () => {
    const { NEXT_PUBLIC_BUDDY_DOCUMENTS_ENABLED: _missing, ...env } = configuredEnv;
    const result = evaluateDocumentCommissioning({ env, evidence: completeEvidence, root: installedRoot() });
    expect(result.decision).toBe("HOLD");
    expect(result.missingConfiguration).toContain("NEXT_PUBLIC_BUDDY_DOCUMENTS_ENABLED");
  });

  it("binds certification to exact release identities", () => {
    const result = evaluateDocumentCommissioning({
      env: configuredEnv,
      evidence: completeEvidence,
      root: installedRoot(),
      expectedRelease: { ...completeEvidence.release, vercelDeploymentId: "dpl_other" },
    });
    expect(result.decision).toBe("HOLD");
    expect(result.releaseBindingComplete).toBe(false);
  });

  it("requires every gate and named approval for GO", () => {
    const env = {
      ...configuredEnv,
      BUDDY_DOCUMENT_DOWNLOADS_ENABLED: "true",
      BUDDY_DOCUMENT_UPLOADS_ENABLED: "true",
      BUDDY_DOCUMENT_SCANNING_ENABLED: "true",
      BUDDY_DOCUMENT_CLEANUP_ENABLED: "true",
      BUDDY_DOCUMENT_OPERATIONS_ENABLED: "true",
      NEXT_PUBLIC_BUDDY_DOCUMENTS_ENABLED: "true",
    };
    const result = evaluateDocumentCommissioning({ env, evidence: completeEvidence, root: installedRoot() });
    expect(result.decision).toBe("GO");
    expect(result.stages).toMatchObject({ installed: true, configured: true, scannerCertified: true, scoped: true, liveTested: true, activated: true });
  });

  it("returns readiness without treating certification as activation authority", () => {
    const evidence = { ...completeEvidence, activation: { authorized: false, organizationId: "", approvedBy: "", approvedAt: "" } };
    const result = evaluateDocumentCommissioning({ env: configuredEnv, evidence, root: installedRoot() });
    expect(result.decision).toBe("READY_FOR_CONTROLLED_ACTIVATION");
    expect(result.enabledGates).toEqual([]);
    expect(result.stages).toMatchObject({ liveTested: true, activated: false });
  });

  it("fails closed for a second organization or a mismatched certified tenant", () => {
    const env = {
      ...configuredEnv,
      BUDDY_DOCUMENTS_ORGANIZATION_IDS: `${configuredEnv.BUDDY_DOCUMENTS_ORGANIZATION_IDS},00000000-0000-4000-8000-000000000099`,
    };
    const result = evaluateDocumentCommissioning({ env, evidence: completeEvidence, root: installedRoot() });
    expect(result.decision).toBe("HOLD");
    expect(result.stages.scoped).toBe(false);
  });

  it("fails closed when only some document gates are enabled", () => {
    const result = evaluateDocumentCommissioning({
      env: { ...configuredEnv, BUDDY_DOCUMENT_SCANNING_ENABLED: "true" },
      evidence: completeEvidence,
      root: installedRoot(),
    });
    expect(result.decision).toBe("HOLD");
    expect(result.holdReasons.join(" ")).toContain("partially enabled");
  });

  it("rejects activation approval for another organization", () => {
    const env = {
      ...configuredEnv,
      BUDDY_DOCUMENT_DOWNLOADS_ENABLED: "true",
      BUDDY_DOCUMENT_UPLOADS_ENABLED: "true",
      BUDDY_DOCUMENT_SCANNING_ENABLED: "true",
      BUDDY_DOCUMENT_CLEANUP_ENABLED: "true",
      BUDDY_DOCUMENT_OPERATIONS_ENABLED: "true",
      NEXT_PUBLIC_BUDDY_DOCUMENTS_ENABLED: "true",
    };
    const evidence = {
      ...completeEvidence,
      activation: { ...completeEvidence.activation, organizationId: "00000000-0000-4000-8000-000000000099" },
    };
    const result = evaluateDocumentCommissioning({ env, evidence, root: installedRoot() });
    expect(result.decision).toBe("HOLD");
    expect(result.stages.activated).toBe(false);
  });
});
