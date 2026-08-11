import { describe, expect, it } from "vitest";
import { canReadInstitutionPipeline, deriveBankerCommandCenter, type DealSummary } from "./read-model";

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
