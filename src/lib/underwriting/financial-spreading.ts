import type { EvidenceReference } from "./contracts";

export const FINANCIAL_SPREAD_CONTRACT_VERSION = "buddy-financial-spread.v1" as const;

export type FinancialOwnerType = "business" | "individual" | "global";
export type FinancialPeriodKind = "annual" | "interim" | "year_to_date" | "trailing_twelve_months" | "as_of";
export type FinancialFactValue = string | number | boolean | null;

export type FinancialPeriod = {
  kind: FinancialPeriodKind;
  startDate: string | null;
  endDate: string;
};

export type FinancialFact = {
  factKey: string;
  value: FinancialFactValue;
  unit: "currency" | "ratio" | "percent" | "count" | "text";
  currency: string | null;
  ownerType: FinancialOwnerType;
  ownerEntityId: string | null;
  period: FinancialPeriod;
  confidence: number | null;
  derivation: "extracted" | "calculated" | "reviewer_adjusted";
  formulaRef: string | null;
  inputs: string[];
  evidence: EvidenceReference[];
};

export type FinancialSpread = {
  contractVersion: typeof FINANCIAL_SPREAD_CONTRACT_VERSION;
  spreadId: string;
  jobId: string;
  organizationId: string;
  dealId: string;
  spreadType: "business" | "personal" | "global_cash_flow" | "rent_roll" | "t12";
  schemaVersion: string;
  engineVersion: string;
  status: "needs_review" | "certified" | "superseded";
  facts: FinancialFact[];
  createdAt: string;
};

export function validateFinancialSpread(spread: FinancialSpread): string[] {
  const errors: string[] = [];
  if (spread.contractVersion !== FINANCIAL_SPREAD_CONTRACT_VERSION) errors.push("unsupported_contract_version");
  if (!spread.organizationId.trim() || !spread.dealId.trim() || !spread.jobId.trim()) errors.push("authority_identity_required");
  if (!spread.schemaVersion.trim() || !spread.engineVersion.trim()) errors.push("engine_identity_required");
  if (spread.facts.length === 0) errors.push("financial_fact_required");

  const keys = new Set<string>();
  for (const fact of spread.facts) {
    const identity = `${fact.ownerType}:${fact.ownerEntityId ?? "global"}:${fact.period.endDate}:${fact.factKey}`;
    if (keys.has(identity)) errors.push("duplicate_fact_identity");
    keys.add(identity);
    if (!/^[a-z][a-z0-9_.-]{2,119}$/.test(fact.factKey)) errors.push("invalid_fact_key");
    if (!validDate(fact.period.endDate) || (fact.period.startDate !== null && !validDate(fact.period.startDate))) errors.push("invalid_fact_period");
    if (fact.period.startDate && fact.period.startDate > fact.period.endDate) errors.push("invalid_fact_period");
    if (fact.ownerType !== "global" && !fact.ownerEntityId?.trim()) errors.push("owner_entity_required");
    if (fact.unit === "currency" && !/^[A-Z]{3}$/.test(fact.currency ?? "")) errors.push("currency_required");
    if (fact.confidence !== null && (!Number.isFinite(fact.confidence) || fact.confidence < 0 || fact.confidence > 1)) errors.push("invalid_fact_confidence");
    if (fact.derivation === "calculated" && (!fact.formulaRef?.trim() || fact.inputs.length === 0)) errors.push("calculation_lineage_required");
    if (fact.derivation === "extracted" && fact.evidence.length === 0) errors.push("source_evidence_required");
  }
  return [...new Set(errors)];
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}
