export const UNDERWRITING_CONTRACT_VERSION = "buddy-underwriting.v1" as const;

export type UnderwritingDocumentRef = {
  documentId: string;
  documentVersionId: string;
  sha256: string;
  mediaType: string;
};

export type UnderwritingJobRequest = {
  contractVersion: typeof UNDERWRITING_CONTRACT_VERSION;
  jobId: string;
  idempotencyKey: string;
  correlationId: string;
  organizationId: string;
  dealId: string;
  requestedBy: string;
  requestedAt: string;
  documents: UnderwritingDocumentRef[];
};

export type EvidenceReference = {
  documentId: string;
  documentVersionId: string;
  sha256: string;
  page: number | null;
  locator: string | null;
};

export type UnderwritingArtifactKind =
  | "document_extraction"
  | "financial_spread"
  | "global_cash_flow"
  | "risk_assessment"
  | "credit_memo";

export type UnderwritingArtifact = {
  artifactId: string;
  kind: UnderwritingArtifactKind;
  schemaVersion: string;
  engineVersion: string;
  confidence: number | null;
  reviewStatus: "needs_review" | "reviewed" | "superseded";
  evidence: EvidenceReference[];
  createdAt: string;
};

export type UnderwritingJobResult = {
  contractVersion: typeof UNDERWRITING_CONTRACT_VERSION;
  jobId: string;
  correlationId: string;
  organizationId: string;
  dealId: string;
  status: "completed" | "needs_review" | "failed";
  artifacts: UnderwritingArtifact[];
  completedAt: string;
  failureCode: string | null;
};

export function validateUnderwritingJobRequest(request: UnderwritingJobRequest): string[] {
  const errors: string[] = [];
  if (request.contractVersion !== UNDERWRITING_CONTRACT_VERSION) errors.push("unsupported_contract_version");
  if (!request.organizationId.trim()) errors.push("organization_required");
  if (!request.dealId.trim()) errors.push("deal_required");
  if (!request.idempotencyKey.trim()) errors.push("idempotency_key_required");
  if (request.documents.length === 0) errors.push("document_required");

  const versionIds = new Set<string>();
  for (const document of request.documents) {
    if (versionIds.has(document.documentVersionId)) errors.push("duplicate_document_version");
    versionIds.add(document.documentVersionId);
    if (!/^[a-f0-9]{64}$/i.test(document.sha256)) errors.push("invalid_document_hash");
  }

  return [...new Set(errors)];
}
