import { describe, expect, it } from "vitest";
import {
  DOCUMENT_INTELLIGENCE_CONTRACT_VERSION,
  validateDocumentIntelligenceResult,
  type DocumentIntelligenceRequest,
  type DocumentIntelligenceResult,
} from "./document-intelligence";

const hash = "a".repeat(64);
const request: DocumentIntelligenceRequest = {
  contractVersion: DOCUMENT_INTELLIGENCE_CONTRACT_VERSION,
  jobId: "job-1", organizationId: "org-1", dealId: "deal-1",
  documentId: "doc-1", documentVersionId: "version-1", sha256: hash, mediaType: "application/pdf",
};
const evidence = { documentId: "doc-1", documentVersionId: "version-1", sha256: hash, page: 1, locator: "line:1-4" };
const result = (): DocumentIntelligenceResult => ({
  contractVersion: DOCUMENT_INTELLIGENCE_CONTRACT_VERSION,
  jobId: "job-1", organizationId: "org-1", dealId: "deal-1",
  documentId: "doc-1", documentVersionId: "version-1", sha256: hash,
  provider: "deterministic-plus-provider", model: null, engineVersion: "engine-1",
  classification: { canonicalType: "business_tax_return", confidence: 0.97, tier: "deterministic_anchor", classifierVersion: "classifier-1", reason: "Form anchor", requiresHumanReview: false, evidence: [evidence] },
  fields: [{ field: "taxYear", value: 2025, confidence: 0.99, evidence: [evidence] }],
  tables: [], completedAt: "2026-08-12T12:00:00.000Z",
});

describe("document intelligence boundary", () => {
  it("accepts versioned, evidence-bound deterministic output", () => {
    expect(validateDocumentIntelligenceResult(request, result())).toEqual([]);
  });

  it("requires human review for AI-assisted classification", () => {
    const value = result();
    value.classification.tier = "ai_assist";
    value.classification.requiresHumanReview = false;
    expect(validateDocumentIntelligenceResult(request, value)).toContain("ai_classification_review_required");
  });

  it("rejects cross-document evidence and hash drift", () => {
    const value = result();
    value.sha256 = "b".repeat(64);
    value.fields[0].evidence[0] = { ...evidence, documentVersionId: "other-version", sha256: "c".repeat(64) };
    expect(validateDocumentIntelligenceResult(request, value)).toEqual(expect.arrayContaining([
      "document_hash_mismatch", "evidence_document_mismatch", "evidence_hash_mismatch",
    ]));
  });

  it("rejects invalid confidence and evidence pages", () => {
    const value = result();
    value.classification.confidence = 1.1;
    value.classification.evidence[0] = { ...evidence, page: 0 };
    expect(validateDocumentIntelligenceResult(request, value)).toEqual(expect.arrayContaining([
      "invalid_classification_confidence", "invalid_evidence_page",
    ]));
  });
});
