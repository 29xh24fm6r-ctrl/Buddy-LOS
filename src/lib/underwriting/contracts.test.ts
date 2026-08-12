import { describe, expect, it } from "vitest";
import {
  UNDERWRITING_CONTRACT_VERSION,
  validateUnderwritingJobRequest,
  type UnderwritingJobRequest,
} from "./contracts";

const validRequest = (): UnderwritingJobRequest => ({
  contractVersion: UNDERWRITING_CONTRACT_VERSION,
  jobId: "job-1",
  idempotencyKey: "deal-1:document-version-1:buddy-underwriting.v1",
  correlationId: "correlation-1",
  organizationId: "organization-1",
  dealId: "deal-1",
  requestedBy: "user-1",
  requestedAt: "2026-08-12T12:00:00.000Z",
  documents: [{
    documentId: "document-1",
    documentVersionId: "document-version-1",
    sha256: "a".repeat(64),
    mediaType: "application/pdf",
  }],
});

describe("underwriting module contract", () => {
  it("accepts an evidence-bound, versioned request", () => {
    expect(validateUnderwritingJobRequest(validRequest())).toEqual([]);
  });

  it("rejects missing tenant, idempotency, documents, and invalid hashes", () => {
    const request = validRequest();
    request.organizationId = "";
    request.idempotencyKey = "";
    request.documents[0].sha256 = "not-a-hash";
    expect(validateUnderwritingJobRequest(request)).toEqual([
      "organization_required",
      "idempotency_key_required",
      "invalid_document_hash",
    ]);
  });

  it("rejects duplicate document versions", () => {
    const request = validRequest();
    request.documents.push({ ...request.documents[0] });
    expect(validateUnderwritingJobRequest(request)).toContain("duplicate_document_version");
  });
});
