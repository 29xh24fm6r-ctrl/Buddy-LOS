import { describe, expect, it } from "vitest";
import { canReadInstitutionPipeline, deriveBankerCommandCenter, deriveBorrowerDirectory, filterBorrowerDirectory, filterDealPipeline, type DealSummary } from "./read-model";

const deal = (overrides: Partial<DealSummary> = {}): DealSummary => ({
  id: "deal-1", borrowerId: "borrower-1", borrowerName: "Acme", dealNumber: "D-1", name: "Acme Expansion",
  productType: "Term loan", requestedAmount: 1000000, approvedAmount: null, stage: "underwriting",
  expectedCloseDate: "2026-08-20", updatedAt: "2026-08-10T12:00:00Z", ...overrides,
});

describe("deriveBankerCommandCenter", () => {
  it("derives honest totals and excludes terminal deals", () => {
    const model = deriveBankerCommandCenter([
      deal(),
      deal({ id: "deal-2", stage: "closed", requestedAmount: 9000000 }),
    ], new Date("2026-08-11T12:00:00Z"));
    expect(model).toMatchObject({ totalActive: 1, totalExposure: 1000000, closingSoon: 1, needsAttention: 0 });
  });

  it("shows stored unknown stages honestly instead of dropping them", () => {
    const model = deriveBankerCommandCenter([deal({ stage: "legacy_review" })]);
    expect(model.lanes[0]).toMatchObject({ stage: "legacy_review", label: "Legacy Review" });
  });

  it("counts only real past target-close dates as attention", () => {
    const model = deriveBankerCommandCenter([
      deal({ id: "past", expectedCloseDate: "2026-08-01" }),
      deal({ id: "missing", expectedCloseDate: null }),
    ], new Date("2026-08-11T12:00:00Z"));
    expect(model.needsAttention).toBe(1);
  });

  it("limits institution-wide pipeline reads to elevated or viewer roles", () => {
    expect(canReadInstitutionPipeline("owner")).toBe(true);
    expect(canReadInstitutionPipeline("administrator")).toBe(true);
    expect(canReadInstitutionPipeline("viewer")).toBe(true);
    expect(canReadInstitutionPipeline("lender")).toBe(false);
    expect(canReadInstitutionPipeline("underwriter")).toBe(false);
    expect(canReadInstitutionPipeline("closer")).toBe(false);
  });
});

describe("CRM and pipeline directory models", () => {
  it("derives active relationship exposure without counting terminal deals", () => {
    const rows = deriveBorrowerDirectory([{ id: "borrower-1", legalName: "Acme", borrowerKind: "business", externalReference: null, relationshipStartDate: null, primaryContact: null }], [
      deal(), deal({ id: "closed", stage: "closed", requestedAmount: 9000000 }),
    ]);
    expect(rows[0]).toMatchObject({ activeDeals: 1, activeExposure: 1000000 });
  });

  it("searches only stored borrower facts", () => {
    const rows = deriveBorrowerDirectory([
      { id: "1", legalName: "Acme Manufacturing", borrowerKind: "business", externalReference: "AC-4", relationshipStartDate: null, primaryContact: "ops@acme.example" },
      { id: "2", legalName: "Blue River", borrowerKind: "nonprofit", externalReference: null, relationshipStartDate: null, primaryContact: null },
    ], []);
    expect(filterBorrowerDirectory(rows, "ops@acme").map((row) => row.id)).toEqual(["1"]);
    expect(filterBorrowerDirectory(rows, "unknown")).toEqual([]);
  });

  it("filters the pipeline by stage and stored deal facts", () => {
    const deals = [deal(), deal({ id: "deal-2", borrowerName: "Blue River", stage: "intake" })];
    expect(filterDealPipeline(deals, "blue", "intake").map((row) => row.id)).toEqual(["deal-2"]);
    expect(filterDealPipeline(deals, "blue", "underwriting")).toEqual([]);
  });
});
