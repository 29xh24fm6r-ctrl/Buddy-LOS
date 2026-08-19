"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadAccessContext } from "@/lib/auth/session";
import { writesEnabledForOrganization } from "@/lib/config/foundation-status";
import { activityKinds, borrowerKinds, canOperateCore, contactKinds, dateTimeValue, enumValue, optionalText, relationshipKinds, requiredText, uuidValue, validContactValue } from "@/lib/los/core-operations";
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
  if(!borrowerId||!idempotencyKey||!kind||label===null||!value||!validContactValue(kind,value)) redirect("/app/crm?view=people&error=invalid-input");
  const supabase=await createClient(); const {error}=await supabase.rpc("create_crm_contact",{p_organization_id:context.activeOrganization.organizationId,p_borrower_id:borrowerId,p_idempotency_key:idempotencyKey,p_contact_kind:kind,p_label:label,p_value:value,p_is_primary:form.get("isPrimary")==="on"});
  if(error) redirect("/app/crm?view=people&error=command-failed"); revalidatePath("/app/crm"); redirect(`/app/borrowers/${borrowerId}`);
}

export async function createCrmRelationship(form: FormData) {
  const context=await commandContext();
  const sourceBorrowerId=uuidValue(form,"sourceBorrowerId"), targetBorrowerId=uuidValue(form,"targetBorrowerId"), idempotencyKey=requiredText(form,"idempotencyKey",8,160), kind=enumValue(form,"relationshipKind",relationshipKinds);
  const roleLabel=optionalText(form,"roleLabel",120), notes=optionalText(form,"notes",4000);
  if(!sourceBorrowerId||!targetBorrowerId||sourceBorrowerId===targetBorrowerId||!idempotencyKey||!kind||roleLabel===null||notes===null) redirect("/app/crm?view=relationships&error=invalid-input");
  const supabase=await createClient(); const {error}=await supabase.rpc("create_crm_relationship",{p_organization_id:context.activeOrganization.organizationId,p_source_borrower_id:sourceBorrowerId,p_target_borrower_id:targetBorrowerId,p_idempotency_key:idempotencyKey,p_relationship_kind:kind,p_role_label:roleLabel,p_notes:notes});
  if(error) redirect("/app/crm?view=relationships&error=command-failed"); revalidatePath("/app/crm"); redirect("/app/crm?view=relationships&saved=relationship");
}

export async function createCrmTask(form: FormData) {
  const context=await commandContext();
  const dealId=uuidValue(form,"dealId"), idempotencyKey=requiredText(form,"idempotencyKey",8,160), title=requiredText(form,"title",2,200), description=optionalText(form,"description",4000), dueAt=dateTimeValue(form,"dueAt",true);
  if(!dealId||!idempotencyKey||!title||description===null||dueAt===undefined) redirect("/app/crm?view=tasks&error=invalid-input");
  const supabase=await createClient(); const {error}=await supabase.rpc("create_deal_task",{p_organization_id:context.activeOrganization.organizationId,p_deal_id:dealId,p_idempotency_key:idempotencyKey,p_title:title,p_description:description,p_due_at:dueAt,p_assigned_to:null});
  if(error) redirect("/app/crm?view=tasks&error=command-failed"); revalidatePath("/app/crm"); redirect("/app/crm?view=tasks&saved=task");
}

export async function completeCrmTask(form: FormData) {
  const context=await commandContext();
  const taskId=uuidValue(form,"taskId"), idempotencyKey=requiredText(form,"idempotencyKey",8,160), expectedVersion=Number(form.get("expectedVersion"));
  if(!taskId||!idempotencyKey||!Number.isInteger(expectedVersion)||expectedVersion<1) redirect("/app/crm?view=tasks&error=invalid-input");
  const supabase=await createClient(); const {error}=await supabase.rpc("complete_deal_task",{p_organization_id:context.activeOrganization.organizationId,p_task_id:taskId,p_idempotency_key:idempotencyKey,p_expected_version:expectedVersion});
  if(error) redirect(`/app/crm?view=tasks&error=${error.code==="40001"?"version-conflict":"command-failed"}`); revalidatePath("/app/crm"); redirect("/app/crm?view=tasks&saved=task");
}

export async function logCrmActivity(form: FormData) {
  const context=await commandContext();
  let borrowerId=uuidValue(form,"borrowerId"); const dealId=uuidValue(form,"dealId",true), idempotencyKey=requiredText(form,"idempotencyKey",8,160), kind=enumValue(form,"activityKind",activityKinds);
  const subject=requiredText(form,"subject",2,200), occurredAt=dateTimeValue(form,"occurredAt"), notes=optionalText(form,"notes",4000);
  if(!borrowerId||dealId===undefined||!idempotencyKey||!kind||!subject||!occurredAt||notes===null) redirect("/app/crm?view=activities&error=invalid-input");
  const supabase=await createClient();
  if(dealId){const{data:deal,error:dealError}=await supabase.from("deals").select("borrower_id").eq("organization_id",context.activeOrganization.organizationId).eq("id",dealId).maybeSingle();if(dealError||!deal)redirect("/app/crm?view=activities&error=not-authorized");borrowerId=deal.borrower_id;}
  const {error}=await supabase.rpc("log_crm_activity",{p_organization_id:context.activeOrganization.organizationId,p_borrower_id:borrowerId,p_deal_id:dealId,p_idempotency_key:idempotencyKey,p_activity_kind:kind,p_subject:subject,p_occurred_at:occurredAt,p_notes:notes});
  if(error) redirect("/app/crm?view=activities&error=command-failed"); revalidatePath("/app/crm"); redirect("/app/crm?view=activities&saved=true");
}
