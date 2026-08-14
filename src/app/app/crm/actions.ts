"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadAccessContext } from "@/lib/auth/session";
import { writesEnabledForOrganization } from "@/lib/config/foundation-status";
import { activityKinds, borrowerKinds, canOperateCore, contactKinds, dateTimeValue, enumValue, optionalText, requiredText, uuidValue } from "@/lib/los/core-operations";
import { createClient } from "@/lib/supabase/server";

async function commandContext() {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind !== "ready" || !writesEnabledForOrganization(context.activeOrganization.organizationId)) redirect("/app/crm?error=not-enabled");
  if (!canOperateCore(context.activeOrganization.role)) redirect("/app/crm?error=not-authorized");
  return context;
}

export async function createCrmCompany(form: FormData) {
  const context = await commandContext();
  const legalName = requiredText(form,"legalName",2,200), idempotencyKey = requiredText(form,"idempotencyKey",8,160);
  const borrowerKind = enumValue(form,"borrowerKind",borrowerKinds), externalReference = optionalText(form,"externalReference",120);
  if (!legalName || !idempotencyKey || !borrowerKind || externalReference === null) redirect("/app/crm?view=companies&error=invalid-input");
  const supabase = await createClient();
  const { data,error } = await supabase.rpc("create_crm_company",{p_organization_id:context.activeOrganization.organizationId,p_idempotency_key:idempotencyKey,p_legal_name:legalName,p_borrower_kind:borrowerKind,p_external_reference:externalReference});
  const borrowerId = (data as {borrowerId?:unknown}|null)?.borrowerId;
  if(error||typeof borrowerId!=="string") redirect("/app/crm?view=companies&error=command-failed");
  revalidatePath("/app/crm"); redirect(`/app/borrowers/${borrowerId}`);
}

export async function createCrmContact(form: FormData) {
  const context = await commandContext();
  const borrowerId=uuidValue(form,"borrowerId"), idempotencyKey=requiredText(form,"idempotencyKey",8,160), kind=enumValue(form,"contactKind",contactKinds);
  const label=optionalText(form,"label",80), value=requiredText(form,"value",1,500);
  if(!borrowerId||!idempotencyKey||!kind||label===null||!value) redirect("/app/crm?view=people&error=invalid-input");
  const supabase=await createClient(); const {error}=await supabase.rpc("create_crm_contact",{p_organization_id:context.activeOrganization.organizationId,p_borrower_id:borrowerId,p_idempotency_key:idempotencyKey,p_contact_kind:kind,p_label:label,p_value:value,p_is_primary:form.get("isPrimary")==="on"});
  if(error) redirect("/app/crm?view=people&error=command-failed"); revalidatePath("/app/crm"); redirect(`/app/borrowers/${borrowerId}`);
}

export async function logCrmActivity(form: FormData) {
  const context=await commandContext();
  const borrowerId=uuidValue(form,"borrowerId"), dealId=uuidValue(form,"dealId",true), idempotencyKey=requiredText(form,"idempotencyKey",8,160), kind=enumValue(form,"activityKind",activityKinds);
  const subject=requiredText(form,"subject",2,200), occurredAt=dateTimeValue(form,"occurredAt"), notes=optionalText(form,"notes",4000);
  if(!borrowerId||dealId===undefined||!idempotencyKey||!kind||!subject||!occurredAt||notes===null) redirect("/app/crm?view=activities&error=invalid-input");
  const supabase=await createClient(); const {error}=await supabase.rpc("log_crm_activity",{p_organization_id:context.activeOrganization.organizationId,p_borrower_id:borrowerId,p_deal_id:dealId,p_idempotency_key:idempotencyKey,p_activity_kind:kind,p_subject:subject,p_occurred_at:occurredAt,p_notes:notes});
  if(error) redirect("/app/crm?view=activities&error=command-failed"); revalidatePath("/app/crm"); redirect("/app/crm?view=activities&saved=true");
}
