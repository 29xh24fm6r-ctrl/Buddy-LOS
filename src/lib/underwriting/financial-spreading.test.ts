import { describe, expect, it } from "vitest";
import { FINANCIAL_SPREAD_CONTRACT_VERSION, validateFinancialSpread, type FinancialSpread } from "./financial-spreading";

const evidence = [{ documentId: "doc-1", documentVersionId: "version-1", sha256: "a".repeat(64), page: 2, locator: "income-statement:revenue" }];
const spread = (): FinancialSpread => ({
  contractVersion: FINANCIAL_SPREAD_CONTRACT_VERSION, spreadId: "spread-1", jobId: "job-1", organizationId: "org-1", dealId: "deal-1",
  spreadType: "business", schemaVersion: "business-spread-1", engineVersion: "engine-1", status: "needs_review", createdAt: "2026-08-12T12:00:00.000Z",
  facts: [{ factKey: "income.revenue", value: 1_000_000, unit: "currency", currency: "USD", ownerType: "business", ownerEntityId: "borrower-1", period: { kind: "annual", startDate: "2025-01-01", endDate: "2025-12-31" }, confidence: 0.98, derivation: "extracted", formulaRef: null, inputs: [], evidence }],
});

describe("financial spreading contract", () => {
  it("accepts a period, entity, currency, and evidence-bound fact", () => expect(validateFinancialSpread(spread())).toEqual([]));
  it("requires evidence for extracted facts", () => { const value=spread(); value.facts[0].evidence=[]; expect(validateFinancialSpread(value)).toContain("source_evidence_required"); });
  it("requires formula and inputs for calculated facts", () => { const value=spread(); value.facts[0]={...value.facts[0],derivation:"calculated",evidence:[],formulaRef:null,inputs:[]}; expect(validateFinancialSpread(value)).toContain("calculation_lineage_required"); });
  it("rejects ambiguous owners, periods, currencies, and duplicate fact identities", () => {
    const value=spread(); value.facts[0].ownerEntityId=null; value.facts[0].currency="usd"; value.facts[0].period.startDate="2026-01-01"; value.facts.push({...value.facts[0]});
    expect(validateFinancialSpread(value)).toEqual(expect.arrayContaining(["owner_entity_required","currency_required","invalid_fact_period","duplicate_fact_identity"]));
  });
});
