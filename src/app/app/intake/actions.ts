"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadAccessContext } from "@/lib/auth/session";
import { readFoundationStatus } from "@/lib/config/foundation-status";
import { canCreateLoanIntake, parseLoanIntake } from "@/lib/los/intake";
import { createClient } from "@/lib/supabase/server";

type IntakeResult = { dealId?: unknown };

export async function createLoanIntake(formData: FormData) {
  if (!readFoundationStatus().writesEnabled) redirect("/app/intake?error=not-enabled");
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind !== "ready" || !canCreateLoanIntake(context.activeOrganization.role))
    redirect("/app/intake?error=not-authorized");

  const parsed = parseLoanIntake(formData);
  if (!parsed.ok) redirect(`/app/intake?error=${parsed.error}`);
  const input = parsed.value;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_loan_intake", {
    p_organization_id: context.activeOrganization.organizationId,
    p_idempotency_key: input.idempotencyKey,
    p_borrower_legal_name: input.borrowerLegalName,
    p_borrower_kind: input.borrowerKind,
    p_borrower_email: input.borrowerEmail,
    p_borrower_phone: input.borrowerPhone,
    p_deal_name: input.dealName,
    p_product_type: input.productType,
    p_purpose: input.purpose,
    p_requested_amount: input.requestedAmount,
    p_expected_close_date: input.expectedCloseDate,
  });
  if (error) redirect("/app/intake?error=command-failed");

  const result = data as IntakeResult | null;
  const dealId = typeof result?.dealId === "string" ? result.dealId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(dealId))
    redirect("/app/intake?error=invalid-response");
  revalidatePath("/app");
  redirect(`/app/deals/${dealId}`);
}
