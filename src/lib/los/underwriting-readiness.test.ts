import { describe, expect, it } from "vitest";
import { deriveUnderwritingReadiness, type ReadinessItem } from "./underwriting-readiness";
const item = (status: string, required = true): ReadinessItem => ({ id: status, label: status, category: "application", status, required, dueDate: null });
describe("underwriting readiness", () => {
  it("requires every unwaived required item and no exception", () => {
    expect(deriveUnderwritingReadiness([item("satisfied")], [item("satisfied")])).toMatchObject({ required: 2, satisfied: 2, percent: 100, readyForReview: true });
    expect(deriveUnderwritingReadiness([item("satisfied")], [item("exception")]).readyForReview).toBe(false);
  });
  it("does not fabricate readiness for an empty checklist", () => {
    expect(deriveUnderwritingReadiness([], [])).toMatchObject({ required: 0, percent: 0, readyForReview: false });
  });
});
