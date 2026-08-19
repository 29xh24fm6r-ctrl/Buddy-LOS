import { describe, expect, it } from "vitest";
import type { DealSummary } from "./read-model";
import { boardedPortfolioDeals, closesWithinDays, dealProfileCompleteness, dealTaskFacts, isPastTargetClose, missingDealFacts } from "./operational-facts";

const deal = (overrides: Partial<DealSummary> = {}): DealSummary => ({
  id: "deal-1", borrowerId: "borrower-1", borrowerName: "Acme", dealNumber: "D-1",
  name: "Acme Expansion", productType: "Term loan", requestedAmount: 500000,
  approvedAmount: null, stage: "underwriting", expectedCloseDate: "2026-09-01",
  updatedAt: "2026-08-19T00:00:00Z", ...overrides,
});

describe("durable operational facts", () => {
  it("derives task counts without inventing unavailable records", () => {
    expect(dealTaskFacts([
      { status: "open", dueAt: "2026-08-18" },
      { status: "open", dueAt: "2026-08-22" },
      { status: "completed", dueAt: "2026-08-17" },
    ], new Date("2026-08-19T12:00:00Z"))).toEqual({ open: 2, completed: 1, overdue: 1, dueSoon: 1 });
  });

  it("derives missing facts and completeness from stored fields", () => {
    const sparse = deal({ requestedAmount: null, productType: null, expectedCloseDate: null });
    expect(missingDealFacts(sparse)).toEqual(["Loan amount", "Product", "Target close"]);
    expect(dealProfileCompleteness(sparse)).toBe(0);
    expect(dealProfileCompleteness(deal())).toBe(100);
  });

  it("uses exact target dates for past-due and closing-window facts", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    expect(isPastTargetClose(deal({ expectedCloseDate: "2026-08-18" }), now)).toBe(true);
    expect(closesWithinDays(deal({ expectedCloseDate: "2026-09-18" }), 30, now)).toBe(true);
    expect(closesWithinDays(deal({ expectedCloseDate: "2026-09-19" }), 30, now)).toBe(false);
  });

  it("does not represent pipeline deals as boarded loans", () => {
    expect(boardedPortfolioDeals([
      deal({ id: "pipeline", stage: "underwriting" }),
      deal({ id: "boarded", stage: "servicing" }),
    ]).map((item) => item.id)).toEqual(["boarded"]);
  });
});
