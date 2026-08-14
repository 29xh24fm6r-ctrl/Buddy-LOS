import { describe, expect, it } from "vitest";
import { evaluateExecutionBoundary } from "../../../scripts/document-lifecycle-certification-harness.mjs";

const organizationId = "9e3f6b9b-7116-41e7-8be4-a0ff97d4bcd7";
const gates = {
  BUDDY_DOCUMENT_DOWNLOADS_ENABLED: "false",
  BUDDY_DOCUMENT_UPLOADS_ENABLED: "false",
  BUDDY_DOCUMENT_SCANNING_ENABLED: "false",
  BUDDY_DOCUMENT_CLEANUP_ENABLED: "false",
  BUDDY_DOCUMENT_OPERATIONS_ENABLED: "false",
  NEXT_PUBLIC_BUDDY_DOCUMENTS_ENABLED: "false",
};

describe("document lifecycle certification execution boundary", () => {
  it("permits only the single internal organization while every gate is false", () => {
    expect(evaluateExecutionBoundary({
      env: { ...gates, BUDDY_DOCUMENTS_ORGANIZATION_IDS: organizationId },
      evidence: { scope: { organizationId, internalOnly: true } },
      organizationId,
    })).toEqual({ safe: true, reasons: [] });
  });

  it("holds when any Buddy LOS document feature is enabled", () => {
    const result = evaluateExecutionBoundary({
      env: { ...gates, BUDDY_DOCUMENT_SCANNING_ENABLED: "true", BUDDY_DOCUMENTS_ORGANIZATION_IDS: organizationId },
      evidence: { scope: { organizationId, internalOnly: true } },
      organizationId,
    });
    expect(result.safe).toBe(false);
    expect(result.reasons.join(" ")).toContain("BUDDY_DOCUMENT_SCANNING_ENABLED");
  });

  it("holds on organization drift", () => {
    const result = evaluateExecutionBoundary({
      env: { ...gates, BUDDY_DOCUMENTS_ORGANIZATION_IDS: organizationId },
      evidence: { scope: { organizationId: "00000000-0000-4000-8000-000000000000", internalOnly: true } },
      organizationId,
    });
    expect(result.safe).toBe(false);
  });
});
