import { describe, expect, it } from "vitest";
import { canCreateLoanIntake, parseLoanIntake } from "./intake";

function validForm() {
  const form = new FormData();
  form.set("idempotencyKey", "intake-12345678");
  form.set("borrowerLegalName", "Acme Manufacturing LLC");
  form.set("borrowerKind", "business");
  form.set("borrowerEmail", "BANKER@ACME.EXAMPLE");
  form.set("borrowerPhone", "555-0100");
  form.set("dealName", "Acme Expansion");
  form.set("productType", "Term loan");
  form.set("purpose", "Equipment expansion");
  form.set("requestedAmount", "1250000");
  form.set("expectedCloseDate", "2026-10-01");
  return form;
}

describe("loan intake validation", () => {
  it("normalizes a valid intake without losing operational fields", () => {
    expect(parseLoanIntake(validForm())).toEqual({ ok: true, value: {
      idempotencyKey: "intake-12345678", borrowerLegalName: "Acme Manufacturing LLC",
      borrowerKind: "business", borrowerEmail: "banker@acme.example", borrowerPhone: "555-0100",
      dealName: "Acme Expansion", productType: "Term loan", purpose: "Equipment expansion",
      requestedAmount: 1250000, expectedCloseDate: "2026-10-01",
    } });
  });

  it("rejects invalid amounts and borrower kinds", () => {
    const form = validForm();
    form.set("requestedAmount", "0");
    form.set("borrowerKind", "corporation");
    expect(parseLoanIntake(form)).toEqual({ ok: false, error: "invalid-input" });
  });

  it("limits intake creation to origination roles", () => {
    expect(canCreateLoanIntake("owner")).toBe(true);
    expect(canCreateLoanIntake("administrator")).toBe(true);
    expect(canCreateLoanIntake("lender")).toBe(true);
    expect(canCreateLoanIntake("underwriter")).toBe(false);
    expect(canCreateLoanIntake("viewer")).toBe(false);
  });
});
