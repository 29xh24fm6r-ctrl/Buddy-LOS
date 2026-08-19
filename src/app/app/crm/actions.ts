"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadAccessContext } from "@/lib/auth/session";
import { writesEnabledForOrganization } from "@/lib/config/foundation-status";
import { activityKinds, appointmentStatuses, borrowerKinds, canOperateCore, contactKinds, dateTimeValueInZone, decimalValue, enumValue, optionalText, referralStatuses, relationshipKinds, requiredText, uuidValue, validContactValue } from "@/lib/los/core-operations";
import { logCrmCommandFailure } from "@/lib/operations/crm-command-log";
import { createClient } from "@/lib/supabase/server";

async function commandContext() {
  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind !== "ready" || !writesEnabledForOrganization(context.activeOrganization.organizationId)) redirect("/app/crm?error=not-enabled");
  if (!canOperateCore(context.activeOrganization.role)) redirect("/app/crm?error=not-authorized");
  return context;
}

function commandFailed(context:Awaited<ReturnType<typeof commandContext>>,command:string,error:{code?:string;message?:string}|null,href:string):never{
  logCrmCommandFailure({command,organizationId:context.activeOrganization.organizationId,userId:context.userId,code:error?.code,message:error?.message});
  redirect(href);
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
  const dealId=uuidValue(form,"dealId"), idempotencyKey=requiredText(form,"idempotencyKey",8,160), title=requiredText(form,"title",2,200), description=optionalText(form,"description",4000), dueAt=dateTimeValueInZone(form,"dueAt",context.activeOrganization.timezone,true);
  if(!dealId||!idempotencyKey||!title||description===null||dueAt===undefined) redirect("/app/crm?view=tasks&error=invalid-input");
  const supabase=await createClient(); const {error}=await supabase.rpc("create_deal_task",{p_organization_id:context.activeOrganization.organizationId,p_deal_id:dealId,p_idempotency_key:idempotencyKey,p_title:title,p_description:description,p_due_at:dueAt,p_assigned_to:context.userId});
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
  const borrowerId=uuidValue(form,"borrowerId"), dealId=uuidValue(form,"dealId",true), idempotencyKey=requiredText(form,"idempotencyKey",8,160), kind=enumValue(form,"activityKind",activityKinds);
  const subject=requiredText(form,"subject",2,200), occurredAt=dateTimeValueInZone(form,"occurredAt",context.activeOrganization.timezone), notes=optionalText(form,"notes",4000);
  if(!borrowerId||dealId===undefined||!idempotencyKey||!kind||!subject||!occurredAt||notes===null) redirect("/app/crm?view=activities&error=invalid-input");
  const supabase=await createClient();
  if(dealId){const{data:deal,error:dealError}=await supabase.from("deals").select("borrower_id").eq("organization_id",context.activeOrganization.organizationId).eq("id",dealId).maybeSingle();if(dealError||!deal)redirect("/app/crm?view=activities&error=not-authorized");if(deal.borrower_id!==borrowerId)redirect("/app/crm?view=activities&error=company-deal-mismatch");}
  const {error}=await supabase.rpc("log_crm_activity",{p_organization_id:context.activeOrganization.organizationId,p_borrower_id:borrowerId,p_deal_id:dealId,p_idempotency_key:idempotencyKey,p_activity_kind:kind,p_subject:subject,p_occurred_at:occurredAt,p_notes:notes});
  if(error) redirect("/app/crm?view=activities&error=command-failed"); revalidatePath("/app/crm"); redirect("/app/crm?view=activities&saved=true");
}

export async function createCrmPerson(form:FormData){
  const context=await commandContext(),borrowerId=uuidValue(form,"borrowerId"),idempotencyKey=requiredText(form,"idempotencyKey",8,160),firstName=requiredText(form,"firstName",1,100),middleName=optionalText(form,"middleName",100),lastName=requiredText(form,"lastName",1,100),preferredName=optionalText(form,"preferredName",100),jobTitle=optionalText(form,"jobTitle",160),roleLabel=requiredText(form,"roleLabel",2,120),ownershipPercentage=decimalValue(form,"ownershipPercentage",true),email=optionalText(form,"email",500),phone=optionalText(form,"phone",30),notes=optionalText(form,"notes",4000);
  if(!borrowerId||!idempotencyKey||!firstName||middleName===null||!lastName||preferredName===null||jobTitle===null||!roleLabel||ownershipPercentage===undefined||email===null||phone===null||notes===null||(email&&!validContactValue("email",email))||(phone&&!validContactValue("phone",phone))||(ownershipPercentage!==null&&(ownershipPercentage<0||ownershipPercentage>100)))redirect("/app/crm?view=people&error=invalid-input");
  const supabase=await createClient();const{error}=await supabase.rpc("create_crm_person",{p_organization_id:context.activeOrganization.organizationId,p_borrower_id:borrowerId,p_idempotency_key:idempotencyKey,p_first_name:firstName,p_middle_name:middleName,p_last_name:lastName,p_preferred_name:preferredName,p_job_title:jobTitle,p_role_label:roleLabel,p_ownership_percentage:ownershipPercentage,p_email:email,p_phone:phone,p_is_primary:form.get("isPrimary")==="on",p_notes:notes});
  if(error)redirect("/app/crm?view=people&error=command-failed");revalidatePath("/app/crm");redirect("/app/crm?view=people&saved=person");
}

export async function updateCrmCompany(form:FormData){
  const context=await commandContext(),[rawBorrowerId,rawVersion]=String(form.get("companySelection")??"").split(":"),borrowerId=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawBorrowerId)?rawBorrowerId:undefined,idempotencyKey=requiredText(form,"idempotencyKey",8,160),legalName=requiredText(form,"legalName",2,200),externalReference=optionalText(form,"externalReference",120),expectedVersion=Number(rawVersion),archive=form.get("archive")==="true";
  if(!borrowerId||!idempotencyKey||!legalName||externalReference===null||!Number.isInteger(expectedVersion)||expectedVersion<1)redirect("/app/crm?view=companies&error=invalid-input");
  const supabase=await createClient();const{error}=await supabase.rpc("update_crm_company",{p_organization_id:context.activeOrganization.organizationId,p_borrower_id:borrowerId,p_idempotency_key:idempotencyKey,p_expected_version:expectedVersion,p_legal_name:legalName,p_external_reference:externalReference,p_archive:archive});
  if(error)redirect(`/app/crm?view=companies&error=${error.code==="40001"?"version-conflict":"command-failed"}`);revalidatePath("/app/crm");redirect("/app/crm?view=companies&saved=company");
}

export async function archiveCrmContact(form:FormData){
  const context=await commandContext(),contactId=uuidValue(form,"contactId"),idempotencyKey=requiredText(form,"idempotencyKey",8,160),expectedVersion=Number(form.get("expectedVersion"));
  if(!contactId||!idempotencyKey||!Number.isInteger(expectedVersion)||expectedVersion<1)redirect("/app/crm?view=people&error=invalid-input");
  const supabase=await createClient();const{error}=await supabase.rpc("archive_crm_contact",{p_organization_id:context.activeOrganization.organizationId,p_contact_id:contactId,p_idempotency_key:idempotencyKey,p_expected_version:expectedVersion});
  if(error)redirect(`/app/crm?view=people&error=${error.code==="40001"?"version-conflict":"command-failed"}`);revalidatePath("/app/crm");redirect("/app/crm?view=people&saved=contact");
}

export async function closeCrmRelationship(form:FormData){
  const context=await commandContext(),relationshipId=uuidValue(form,"relationshipId"),idempotencyKey=requiredText(form,"idempotencyKey",8,160);
  if(!relationshipId||!idempotencyKey)redirect("/app/crm?view=relationships&error=invalid-input");
  const supabase=await createClient();const{error}=await supabase.rpc("close_crm_relationship",{p_organization_id:context.activeOrganization.organizationId,p_relationship_id:relationshipId,p_idempotency_key:idempotencyKey,p_expected_active:true});
  if(error)redirect(`/app/crm?view=relationships&error=${error.code==="40001"?"version-conflict":"command-failed"}`);revalidatePath("/app/crm");redirect("/app/crm?view=relationships&saved=relationship");
}

export async function updateCrmTask(form:FormData){
  const context=await commandContext(),taskId=uuidValue(form,"taskId"),idempotencyKey=requiredText(form,"idempotencyKey",8,160),title=requiredText(form,"title",2,200),description=optionalText(form,"description",4000),dueAt=dateTimeValueInZone(form,"dueAt",context.activeOrganization.timezone,true),assignedTo=uuidValue(form,"assignedTo",true),expectedVersion=Number(form.get("expectedVersion")),cancel=form.get("cancel")==="true";
  if(!taskId||!idempotencyKey||!title||description===null||dueAt===undefined||assignedTo===undefined||!Number.isInteger(expectedVersion)||expectedVersion<1)redirect("/app/crm?view=tasks&error=invalid-input");
  const supabase=await createClient();const{error}=await supabase.rpc("update_deal_task",{p_organization_id:context.activeOrganization.organizationId,p_task_id:taskId,p_idempotency_key:idempotencyKey,p_expected_version:expectedVersion,p_title:title,p_description:description,p_due_at:dueAt,p_assigned_to:assignedTo,p_cancel:cancel});
  if(error)redirect(`/app/crm?view=tasks&error=${error.code==="40001"?"version-conflict":"command-failed"}`);revalidatePath("/app/crm");redirect("/app/crm?view=tasks&saved=task");
}

export async function createCrmReferral(form:FormData){
  const context=await commandContext(),borrowerId=uuidValue(form,"borrowerId"),sourceBorrowerId=uuidValue(form,"sourceBorrowerId",true),sourcePersonId=uuidValue(form,"sourcePersonId",true),dealId=uuidValue(form,"dealId",true),idempotencyKey=requiredText(form,"idempotencyKey",8,160),referredAt=dateTimeValueInZone(form,"referredAt",context.activeOrganization.timezone),estimatedValue=decimalValue(form,"estimatedValue",true),notes=optionalText(form,"notes",4000);
  if(!borrowerId||sourceBorrowerId===undefined||sourcePersonId===undefined||(!sourceBorrowerId&&!sourcePersonId)||(sourceBorrowerId===borrowerId)||dealId===undefined||!idempotencyKey||!referredAt||estimatedValue===undefined||(estimatedValue!==null&&estimatedValue<0)||notes===null)redirect("/app/crm?view=referrals&error=invalid-input");
  const supabase=await createClient();const{error}=await supabase.rpc("create_crm_referral",{p_organization_id:context.activeOrganization.organizationId,p_borrower_id:borrowerId,p_source_borrower_id:sourceBorrowerId,p_source_person_id:sourcePersonId,p_deal_id:dealId,p_idempotency_key:idempotencyKey,p_referred_at:referredAt,p_estimated_value:estimatedValue,p_notes:notes});
  if(error)redirect("/app/crm?view=referrals&error=command-failed");revalidatePath("/app/crm");redirect("/app/crm?view=referrals&saved=referral");
}

export async function createCrmAppointment(form:FormData){
  const context=await commandContext(),borrowerId=uuidValue(form,"borrowerId"),dealId=uuidValue(form,"dealId",true),idempotencyKey=requiredText(form,"idempotencyKey",8,160),subject=requiredText(form,"subject",2,200),startsAt=dateTimeValueInZone(form,"startsAt",context.activeOrganization.timezone),endsAt=dateTimeValueInZone(form,"endsAt",context.activeOrganization.timezone),location=optionalText(form,"location",500),notes=optionalText(form,"notes",4000);
  if(!borrowerId||dealId===undefined||!idempotencyKey||!subject||!startsAt||!endsAt||Date.parse(endsAt)<=Date.parse(startsAt)||location===null||notes===null)redirect("/app/crm?view=calendar&error=invalid-input");
  if(dealId){const supabase=await createClient();const{data:deal,error}=await supabase.from("deals").select("borrower_id").eq("organization_id",context.activeOrganization.organizationId).eq("id",dealId).maybeSingle();if(error||!deal||deal.borrower_id!==borrowerId)redirect("/app/crm?view=calendar&error=company-deal-mismatch");}
  const supabase=await createClient();const{error}=await supabase.rpc("create_crm_appointment",{p_organization_id:context.activeOrganization.organizationId,p_borrower_id:borrowerId,p_deal_id:dealId,p_idempotency_key:idempotencyKey,p_subject:subject,p_starts_at:startsAt,p_ends_at:endsAt,p_assigned_to:context.userId,p_location:location,p_notes:notes});
  if(error)redirect("/app/crm?view=calendar&error=command-failed");revalidatePath("/app/crm");redirect("/app/crm?view=calendar&saved=appointment");
}

export async function updateCrmPerson(form:FormData){
  const context=await commandContext(),personId=uuidValue(form,"personId"),idempotencyKey=requiredText(form,"idempotencyKey",8,160),expectedVersion=Number(form.get("expectedVersion")),firstName=requiredText(form,"firstName",1,100),middleName=optionalText(form,"middleName",100),lastName=requiredText(form,"lastName",1,100),preferredName=optionalText(form,"preferredName",100),jobTitle=optionalText(form,"jobTitle",160),notes=optionalText(form,"notes",4000),archive=form.get("archive")==="true";
  if(!personId||!idempotencyKey||!Number.isInteger(expectedVersion)||expectedVersion<1||!firstName||middleName===null||!lastName||preferredName===null||jobTitle===null||notes===null)redirect("/app/crm?view=people&error=invalid-input");
  const supabase=await createClient();const{error}=await supabase.rpc("update_crm_person",{p_organization_id:context.activeOrganization.organizationId,p_person_id:personId,p_idempotency_key:idempotencyKey,p_expected_version:expectedVersion,p_first_name:firstName,p_middle_name:middleName,p_last_name:lastName,p_preferred_name:preferredName,p_job_title:jobTitle,p_notes:notes,p_archive:archive});
  if(error)commandFailed(context,"update_crm_person",error,`/app/crm?view=people&error=${error.code==="40001"?"version-conflict":"command-failed"}`);revalidatePath("/app/crm");redirect("/app/crm?view=people&saved=person");
}

export async function createCrmPersonContact(form:FormData){
  const context=await commandContext(),personId=uuidValue(form,"personId"),idempotencyKey=requiredText(form,"idempotencyKey",8,160),kind=enumValue(form,"contactKind",contactKinds),label=optionalText(form,"label",80),value=requiredText(form,"value",1,500);
  if(!personId||!idempotencyKey||!kind||label===null||!value||!validContactValue(kind,value))redirect("/app/crm?view=people&error=invalid-input");
  const supabase=await createClient();const{error}=await supabase.rpc("create_crm_person_contact",{p_organization_id:context.activeOrganization.organizationId,p_person_id:personId,p_idempotency_key:idempotencyKey,p_contact_kind:kind,p_label:label,p_value:value,p_is_primary:form.get("isPrimary")==="on"});
  if(error)commandFailed(context,"create_crm_person_contact",error,"/app/crm?view=people&error=command-failed");revalidatePath("/app/crm");redirect("/app/crm?view=people&saved=contact");
}

export async function updateCrmReferral(form:FormData){
  const context=await commandContext(),referralId=uuidValue(form,"referralId"),idempotencyKey=requiredText(form,"idempotencyKey",8,160),expectedVersion=Number(form.get("expectedVersion")),status=enumValue(form,"status",referralStatuses),outcome=optionalText(form,"outcome",500),notes=optionalText(form,"notes",4000);
  if(!referralId||!idempotencyKey||!Number.isInteger(expectedVersion)||expectedVersion<1||!status||outcome===null||notes===null)redirect("/app/crm?view=referrals&error=invalid-input");
  const supabase=await createClient();const{error}=await supabase.rpc("update_crm_referral",{p_organization_id:context.activeOrganization.organizationId,p_referral_id:referralId,p_idempotency_key:idempotencyKey,p_expected_version:expectedVersion,p_status:status,p_outcome:outcome,p_notes:notes});
  if(error)commandFailed(context,"update_crm_referral",error,`/app/crm?view=referrals&error=${error.code==="40001"?"version-conflict":"command-failed"}`);revalidatePath("/app/crm");redirect("/app/crm?view=referrals&saved=referral");
}

export async function updateCrmAppointment(form:FormData){
  const context=await commandContext(),appointmentId=uuidValue(form,"appointmentId"),idempotencyKey=requiredText(form,"idempotencyKey",8,160),expectedVersion=Number(form.get("expectedVersion")),subject=requiredText(form,"subject",2,200),startsAt=dateTimeValueInZone(form,"startsAt",context.activeOrganization.timezone),endsAt=dateTimeValueInZone(form,"endsAt",context.activeOrganization.timezone),status=enumValue(form,"status",appointmentStatuses),assignedTo=uuidValue(form,"assignedTo",true),location=optionalText(form,"location",500),notes=optionalText(form,"notes",4000);
  if(!appointmentId||!idempotencyKey||!Number.isInteger(expectedVersion)||expectedVersion<1||!subject||!startsAt||!endsAt||Date.parse(endsAt)<=Date.parse(startsAt)||!status||assignedTo===undefined||location===null||notes===null)redirect("/app/crm?view=calendar&error=invalid-input");
  const supabase=await createClient();const{error}=await supabase.rpc("update_crm_appointment",{p_organization_id:context.activeOrganization.organizationId,p_appointment_id:appointmentId,p_idempotency_key:idempotencyKey,p_expected_version:expectedVersion,p_subject:subject,p_starts_at:startsAt,p_ends_at:endsAt,p_status:status,p_assigned_to:assignedTo,p_location:location,p_notes:notes});
  if(error)commandFailed(context,"update_crm_appointment",error,`/app/crm?view=calendar&error=${error.code==="40001"?"version-conflict":"command-failed"}`);revalidatePath("/app/crm");redirect("/app/crm?view=calendar&saved=appointment");
}

export async function assignCrmCompany(form:FormData){
  const context=await commandContext(),borrowerId=uuidValue(form,"borrowerId"),userId=uuidValue(form,"userId"),idempotencyKey=requiredText(form,"idempotencyKey",8,160);
  if(!borrowerId||!userId||!idempotencyKey)redirect("/app/crm?view=companies&error=invalid-input");const supabase=await createClient();const{error}=await supabase.rpc("assign_crm_company",{p_organization_id:context.activeOrganization.organizationId,p_borrower_id:borrowerId,p_user_id:userId,p_idempotency_key:idempotencyKey});
  if(error)commandFailed(context,"assign_crm_company",error,"/app/crm?view=companies&error=command-failed");revalidatePath("/app/crm");redirect("/app/crm?view=companies&saved=assignment");
}

export async function endCrmCompanyAssignment(form:FormData){
  const context=await commandContext(),borrowerId=uuidValue(form,"borrowerId"),userId=uuidValue(form,"userId"),idempotencyKey=requiredText(form,"idempotencyKey",8,160);
  if(!borrowerId||!userId||!idempotencyKey)redirect("/app/crm?view=companies&error=invalid-input");const supabase=await createClient();const{error}=await supabase.rpc("end_crm_company_assignment",{p_organization_id:context.activeOrganization.organizationId,p_borrower_id:borrowerId,p_user_id:userId,p_idempotency_key:idempotencyKey});
  if(error)commandFailed(context,"end_crm_company_assignment",error,"/app/crm?view=companies&error=command-failed");revalidatePath("/app/crm");redirect("/app/crm?view=companies&saved=assignment");
}
