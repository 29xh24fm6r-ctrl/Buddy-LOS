import { describe, expect, it } from "vitest";
import { canRequestUnderwriting, latestCleanDocumentVersions, underwritingRequestBlocked, underwritingStatusLabel } from "./workspace";
import type { DealDocumentVersion } from "@/lib/los/queries";

const version = (overrides: Partial<DealDocumentVersion> = {}): DealDocumentVersion => ({
  id: "doc-1", requirementId: null, logicalDocumentId: "logical-1", versionNumber: 1,
  fileName: "statement.pdf", mimeType: "application/pdf", sizeBytes: 100, sha256: "a".repeat(64),
  securityStatus: "clean", uploadedAt: "2026-08-12T12:00:00Z", scannedAt: "2026-08-12T12:01:00Z",
  retainedUntil: null, legalHold: false, scanJob: null, ...overrides,
});

describe("Underwriter workflow", () => {
  it("keeps request authority separated by role", () => {
    expect(canRequestUnderwriting("owner")).toBe(true);
    expect(canRequestUnderwriting("administrator")).toBe(true);
    expect(canRequestUnderwriting("underwriter")).toBe(true);
    expect(canRequestUnderwriting("lender")).toBe(false);
  });

  it("selects only the latest clean version of each logical document", () => {
    const selected = latestCleanDocumentVersions([
      version(),
      version({ id: "doc-2", versionNumber: 2, securityStatus: "quarantined" }),
      version({ id: "doc-3", logicalDocumentId: "logical-2", fileName: "tax-return.pdf" }),
    ]);
    expect(selected.map((item) => item.id)).toEqual(["doc-3"]);
  });

  it("fails closed before creating work", () => {
    const base = { runtimeEnabled: true, entitled: true, role: "underwriter" as const, eligibleDocumentCount: 1, latestStatus: null };
    expect(underwritingRequestBlocked({ ...base, runtimeEnabled: false })).toBe("runtime_disabled");
    expect(underwritingRequestBlocked({ ...base, entitled: false })).toBe("entitlement_required");
    expect(underwritingRequestBlocked({ ...base, eligibleDocumentCount: 0 })).toBe("clean_documents_required");
    expect(underwritingRequestBlocked({ ...base, latestStatus: "processing" })).toBe("job_in_progress");
    expect(underwritingRequestBlocked(base)).toBeNull();
    expect(underwritingStatusLabel("needs_review")).toBe("Needs Review");
  });
});
