import { describe, expect, it } from "vitest";
import { canRecoverDocumentScan, parseDocumentScanRecoveryInput, safeDocumentScanFailure } from "./document-scan-recovery";

describe("document scan recovery", () => {
  it("limits recovery to institution administrators", () => {
    expect(canRecoverDocumentScan("owner")).toBe(true);
    expect(canRecoverDocumentScan("administrator")).toBe(true);
    expect(canRecoverDocumentScan("lender")).toBe(false);
  });
  it("requires a bounded reason and idempotency key", () => {
    expect(parseDocumentScanRecoveryInput({ reason: "Retry after credential repair", idempotencyKey: "recovery-123" })).toEqual({ reason: "Retry after credential repair", idempotencyKey: "recovery-123" });
    expect(parseDocumentScanRecoveryInput({ reason: "x", idempotencyKey: "short" })).toBeNull();
  });
  it("does not expose raw provider failures", () => {
    expect(safeDocumentScanFailure("Cloud Run scanner identity authentication was rejected.")).toBe("Cloud Run scanner identity was rejected.");
    expect(safeDocumentScanFailure("Cloud Run scanner invocation authorization was rejected.")).toBe("Cloud Run scanner invocation was rejected.");
    expect(safeDocumentScanFailure("Scanner API authentication was rejected.")).toBe("Scanner API authentication was rejected.");
    expect(safeDocumentScanFailure("scanner HTTP 401 secret text")).toBe("Scanner authentication was rejected.");
    expect(safeDocumentScanFailure("unrecognized internal detail")).toBe("Scanner submission failed.");
  });
});
