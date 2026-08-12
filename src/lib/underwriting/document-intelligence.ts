import type { EvidenceReference } from "./contracts";

export const DOCUMENT_INTELLIGENCE_CONTRACT_VERSION = "buddy-document-intelligence.v1" as const;

export type ClassificationTier = "deterministic_anchor" | "deterministic_structural" | "ai_assist" | "unclassified";

export type DocumentClassification = {
  canonicalType: string;
  confidence: number;
  tier: ClassificationTier;
  classifierVersion: string;
  reason: string;
  requiresHumanReview: boolean;
  evidence: EvidenceReference[];
};

export type ExtractedField = {
  field: string;
  value: string | number | boolean | null;
  confidence: number | null;
  evidence: EvidenceReference[];
};

export type ExtractionTable = {
  name: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
  evidence: EvidenceReference[];
};

export type DocumentIntelligenceRequest = {
  contractVersion: typeof DOCUMENT_INTELLIGENCE_CONTRACT_VERSION;
  jobId: string;
  organizationId: string;
  dealId: string;
  documentId: string;
  documentVersionId: string;
  sha256: string;
  mediaType: string;
};

export type DocumentIntelligenceResult = {
  contractVersion: typeof DOCUMENT_INTELLIGENCE_CONTRACT_VERSION;
  jobId: string;
  organizationId: string;
  dealId: string;
  documentId: string;
  documentVersionId: string;
  sha256: string;
  provider: string;
  model: string | null;
  engineVersion: string;
  classification: DocumentClassification;
  fields: ExtractedField[];
  tables: ExtractionTable[];
  completedAt: string;
};

export interface DocumentIntelligenceProvider {
  readonly provider: string;
  analyze(request: DocumentIntelligenceRequest, document: Blob): Promise<DocumentIntelligenceResult>;
}

export function validateDocumentIntelligenceResult(
  request: DocumentIntelligenceRequest,
  result: DocumentIntelligenceResult,
): string[] {
  const errors: string[] = [];
  if (result.contractVersion !== DOCUMENT_INTELLIGENCE_CONTRACT_VERSION) errors.push("unsupported_contract_version");
  if (result.jobId !== request.jobId) errors.push("job_mismatch");
  if (result.organizationId !== request.organizationId) errors.push("organization_mismatch");
  if (result.dealId !== request.dealId) errors.push("deal_mismatch");
  if (result.documentId !== request.documentId || result.documentVersionId !== request.documentVersionId) errors.push("document_version_mismatch");
  if (result.sha256 !== request.sha256 || !/^[a-f0-9]{64}$/i.test(result.sha256)) errors.push("document_hash_mismatch");
  if (!result.provider.trim() || !result.engineVersion.trim()) errors.push("engine_identity_required");
  if (!confidence(result.classification.confidence)) errors.push("invalid_classification_confidence");
  if (!result.classification.classifierVersion.trim()) errors.push("classifier_version_required");
  if (result.classification.tier === "ai_assist" && !result.classification.requiresHumanReview) errors.push("ai_classification_review_required");

  for (const field of result.fields) {
    if (!field.field.trim()) errors.push("field_name_required");
    if (field.confidence !== null && !confidence(field.confidence)) errors.push("invalid_field_confidence");
    validateEvidence(request, field.evidence, errors);
  }
  validateEvidence(request, result.classification.evidence, errors);
  for (const table of result.tables) validateEvidence(request, table.evidence, errors);
  return [...new Set(errors)];
}

function confidence(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateEvidence(request: DocumentIntelligenceRequest, evidence: EvidenceReference[], errors: string[]) {
  for (const item of evidence) {
    if (item.documentId !== request.documentId || item.documentVersionId !== request.documentVersionId) errors.push("evidence_document_mismatch");
    if (item.sha256 !== request.sha256) errors.push("evidence_hash_mismatch");
    if (item.page !== null && (!Number.isInteger(item.page) || item.page < 1)) errors.push("invalid_evidence_page");
  }
}
