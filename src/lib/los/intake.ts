export const borrowerKinds = ["business", "individual", "trust", "government", "nonprofit", "other"] as const;
export type BorrowerKind = (typeof borrowerKinds)[number];

export type LoanIntakeInput = {
  idempotencyKey: string;
  borrowerLegalName: string;
  borrowerKind: BorrowerKind;
  borrowerEmail: string;
  borrowerPhone: string;
  dealName: string;
  productType: string;
  purpose: string;
  requestedAmount: number;
  expectedCloseDate: string | null;
};

export type IntakeValidation =
  | { ok: true; value: LoanIntakeInput }
  | { ok: false; error: "invalid-input" };

export function parseLoanIntake(formData: FormData): IntakeValidation {
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const idempotencyKey = text("idempotencyKey");
  const borrowerLegalName = text("borrowerLegalName");
  const borrowerKind = text("borrowerKind");
  const borrowerEmail = text("borrowerEmail").toLowerCase();
  const borrowerPhone = text("borrowerPhone");
  const dealName = text("dealName");
  const productType = text("productType");
  const purpose = text("purpose");
  const requestedAmount = Number(text("requestedAmount"));
  const expectedCloseDate = text("expectedCloseDate") || null;

  const valid = idempotencyKey.length >= 8 && idempotencyKey.length <= 160
    && borrowerLegalName.length >= 2 && borrowerLegalName.length <= 200
    && borrowerKinds.includes(borrowerKind as BorrowerKind)
    && (!borrowerEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(borrowerEmail))
    && borrowerPhone.length <= 50
    && dealName.length >= 2 && dealName.length <= 200
    && productType.length <= 120
    && purpose.length <= 2000
    && Number.isFinite(requestedAmount) && requestedAmount > 0
    && (!expectedCloseDate || /^\d{4}-\d{2}-\d{2}$/.test(expectedCloseDate));

  if (!valid) return { ok: false, error: "invalid-input" };
  return { ok: true, value: {
    idempotencyKey, borrowerLegalName, borrowerKind: borrowerKind as BorrowerKind,
    borrowerEmail, borrowerPhone, dealName, productType, purpose,
    requestedAmount, expectedCloseDate,
  } };
}

export function canCreateLoanIntake(role: string) {
  return role === "owner" || role === "administrator" || role === "lender";
}
