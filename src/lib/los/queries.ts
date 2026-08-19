import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeDocumentScanFailure } from "./document-scan-recovery";
import { canReadInstitutionPipeline, type BorrowerSummary, type DealSummary } from "./read-model";
import type { AccessContext } from "@/lib/auth/access-context";
import { deriveUnderwritingReadiness, type ReadinessItem, type UnderwritingReadiness } from "./underwriting-readiness";
import { decideModuleAccess, type ModuleAccessDecision, type ProductModuleEntitlement } from "@/lib/modules/entitlements";
import type { UnderwritingJobSummary } from "@/lib/underwriting/workspace";

type ReadyContext = Extract<AccessContext, { kind: "ready" }>;
type DealRow = {
  id: string; borrower_id: string; deal_number: string | null; name: string; product_type: string | null;
  requested_amount: number | string | null; approved_amount: number | string | null; stage: string;
  expected_close_date: string | null; updated_at: string;
};
type BorrowerRow = { id: string; legal_name: string };
type BorrowerDirectoryRecord = BorrowerRow & {
  version: number; borrower_kind: string; external_reference: string | null; relationship_start_date: string | null;
};
type DealDocumentRow = {
  id: string; requirement_id: string | null; logical_document_id: string; version_number: number;
  original_file_name: string; mime_type: string; size_bytes: number | string; sha256: string | null;
  security_status: string; uploaded_at: string; scanned_at: string | null; retained_until: string | null; legal_hold: boolean;
};
type DocumentScanJobRow = {
  document_id: string; status: string; attempt_count: number; max_attempts: number;
  last_error: string | null; updated_at: string;
};

export type DocumentScanJobSummary = {
  status: string; attemptCount: number; maxAttempts: number; lastError: string | null;
  updatedAt: string; recoverable: boolean;
};

export type DealDocumentVersion = {
  id: string; requirementId: string | null; logicalDocumentId: string; versionNumber: number;
  fileName: string; mimeType: string; sizeBytes: number; sha256: string | null;
  securityStatus: string; uploadedAt: string; scannedAt: string | null; retainedUntil: string | null; legalHold: boolean;
  scanJob: DocumentScanJobSummary | null;
};

export type DealDetail = DealSummary & {
  purpose: string | null; createdAt: string; version: number; readiness: UnderwritingReadiness;
  documentVersions: DealDocumentVersion[];
};
export type UnderwritingWorkspaceRecord = { moduleAccess: ModuleAccessDecision; latestJob: UnderwritingJobSummary | null };
export type GoldenLoanWorkspaceRecord = {
  memo: { id:string; status:string; certifiedAt:string|null } | null;
  decision: { id:string; decision:string; decidedAt:string } | null;
  conditions: { id:string; description:string; status:string }[];
  closing: { id:string; title:string; status:string; required:boolean }[];
  funding: { id:string; amount:number; authorizedAt:string } | null;
  servicing: { id:string; accountNumber:string; balance:number; nextReviewDate:string|null } | null;
  covenants: { id:string; title:string; status:string; dueDate:string }[];
};
export type BorrowerDetail = {
  id: string; version: number; legalName: string; borrowerKind: string; externalReference: string | null;
  relationshipStartDate: string | null; contacts: { id: string; kind: string; label: string | null; value: string; isPrimary: boolean; isVerified: boolean; restrictedUse: boolean }[];
  people: { id:string; name:string; title:string|null }[];
  relationships: { id:string; counterpartName:string; kind:string; roleLabel:string|null; active:boolean }[];
  activities: { id:string; subject:string; occurredAt:string }[];
  referrals: { id:string; status:string; referredAt:string }[];
  appointments: { id:string; subject:string; status:string; startsAt:string }[];
  opportunities: { id:string; name:string; stage:string }[];
  tasks: { id:string; dealId:string; dealName:string; title:string; status:string; dueAt:string|null }[];
  assignments: { userId:string; displayName:string; role:string }[];
};
export type CrmActivityRecord = { id:string; borrowerId:string; borrowerName:string; dealId:string|null; kind:string; subject:string; occurredAt:string; notes:string|null };
export type CrmContactRecord = { id:string; borrowerId:string; borrowerName:string; kind:string; label:string|null; value:string; isPrimary:boolean; isVerified:boolean; restrictedUse:boolean; version:number };
export type CrmRelationshipRecord = { id:string; sourceBorrowerId:string; sourceName:string; targetBorrowerId:string|null; targetName:string|null; dealId:string|null; dealName:string|null; kind:string; roleLabel:string|null; notes:string|null; isActive:boolean };
export type DealTaskRecord = { id:string; dealId:string; dealName:string; title:string; description:string|null; status:string; dueAt:string|null; assignedTo:string|null; version:number };
export type CrmPersonRecord = { id:string; borrowerId:string; borrowerName:string; firstName:string; middleName:string|null; lastName:string; preferredName:string|null; jobTitle:string|null; roleLabel:string; ownershipPercentage:number|null; isPrimary:boolean; email:string|null; phone:string|null; notes:string|null; version:number };
export type CrmReferralRecord = { id:string; borrowerId:string; borrowerName:string; sourceName:string; dealId:string|null; dealName:string|null; status:string; referredAt:string; estimatedValue:number|null; notes:string|null; outcome:string|null; version:number };
export type CrmAppointmentRecord = { id:string; borrowerId:string; borrowerName:string; dealId:string|null; dealName:string|null; subject:string; startsAt:string; endsAt:string; status:string; assignedTo:string|null; location:string|null; notes:string|null; version:number };
export type CrmMetrics = { companies:number; people:number; contactPoints:number; relationships:number; activities:number; referrals:number; appointments:number; tasks:number; openTasks:number; opportunities:number; openOpportunities:number; activeExposure:number };
export type CrmOperatorRecord = { userId:string; displayName:string; role:string };
export type CrmArchivedRecord = { id:string; label:string; version:number; entity:"company"|"contact"|"person" };

const CRM_PAGE_SIZE=50;
function crmRange(page:number){const safe=Math.max(1,Math.floor(page)||1),from=(safe-1)*CRM_PAGE_SIZE;return{from,to:from+CRM_PAGE_SIZE-1};}
function safePostgrestSearch(value:string){return value.trim().replace(/[%_,().]/g," ").replace(/\s+/g," ").slice(0,100);}
async function crmSearchIds(context:ReadyContext,view:string,search:string):Promise<string[]|null>{
  const term=safePostgrestSearch(search);if(!term)return null;
  const supabase=await createClient();const{data,error}=await supabase.rpc("crm_workspace_search_ids",{p_organization_id:context.activeOrganization.organizationId,p_view:view,p_search:term});
  if(error)throw new Error("Unable to search authorized CRM records.");
  return(data??[]).map((row:{id:unknown})=>row.id as string);
}

export async function loadCommandCenterDeals(context: ReadyContext, page?:number, search=""): Promise<DealSummary[]> {
  const supabase = await createClient();
  const organizationId = context.activeOrganization.organizationId;
  let allowedDealIds: string[] | null = null;
  if (!canReadInstitutionPipeline(context.activeOrganization.role)) {
    const { data, error } = await supabase.from("deal_assignments").select("deal_id")
      .eq("organization_id", organizationId).eq("user_id", context.userId).is("ended_at", null);
    if (error) throw new Error("Unable to load deal assignments.");
    allowedDealIds = [...new Set((data ?? []).map((row) => row.deal_id as string))];
    if (allowedDealIds.length === 0) return [];
  }

  let query = supabase.from("deals")
    .select("id, borrower_id, deal_number, name, product_type, requested_amount, approved_amount, stage, expected_close_date, updated_at")
    .eq("organization_id", organizationId).is("archived_at", null).order("updated_at", { ascending: false });
  if (allowedDealIds) query = query.in("id", allowedDealIds);
  const matchingIds=await crmSearchIds(context,"opportunities",search);
  if(matchingIds&&!matchingIds.length)return[];
  if(matchingIds)query=query.in("id",matchingIds);
  if(page){const{from,to}=crmRange(page);query=query.range(from,to);}else query=query.limit(200);
  const { data: dealData, error: dealError } = await query;
  if (dealError) throw new Error("Unable to load the deal pipeline.");

  const dealRows = (dealData ?? []) as DealRow[];
  const borrowerIds = [...new Set(dealRows.map((deal) => deal.borrower_id))];
  const borrowers = new Map<string, string>();
  if (borrowerIds.length > 0) {
    const { data, error } = await supabase.from("borrowers").select("id, legal_name")
      .eq("organization_id", organizationId).in("id", borrowerIds);
    if (error) throw new Error("Unable to load borrower names.");
    for (const row of (data ?? []) as BorrowerRow[]) borrowers.set(row.id, row.legal_name);
  }
  return dealRows.map((row) => toSummary(row, borrowers.get(row.borrower_id) ?? "Borrower unavailable"));
}

export async function loadBorrowerDirectory(context: ReadyContext,page?:number,search=""): Promise<BorrowerSummary[]> {
  const supabase = await createClient();
  const organizationId = context.activeOrganization.organizationId;
  let borrowerQuery=supabase.from("borrowers")
      .select("id, version, legal_name, borrower_kind, external_reference, relationship_start_date")
      .eq("organization_id", organizationId).is("archived_at", null).order("legal_name");
  const matchingIds=await crmSearchIds(context,"companies",search);
  if(matchingIds&&!matchingIds.length)return[];
  if(matchingIds)borrowerQuery=borrowerQuery.in("id",matchingIds);
  if(page){const{from,to}=crmRange(page);borrowerQuery=borrowerQuery.range(from,to);}else borrowerQuery=borrowerQuery.limit(500);
  const{data:borrowerData,error:borrowerError}=await borrowerQuery;
  if(borrowerError)throw new Error("Unable to load the borrower directory.");
  const borrowerIds=(borrowerData??[]).map(borrower=>borrower.id as string);
  const{data:contactData,error:contactError}=borrowerIds.length?await supabase.from("borrower_contacts").select("borrower_id, value, restricted_use").eq("organization_id",organizationId).eq("is_primary",true).is("archived_at",null).in("borrower_id",borrowerIds).order("created_at"):{data:[],error:null};
  if(contactError)throw new Error("Unable to load the borrower directory.");
  const contacts = new Map<string, string>();
  for (const contact of contactData ?? []) {
    if (!contacts.has(contact.borrower_id)) contacts.set(contact.borrower_id, contact.restricted_use ? "Restricted" : contact.value);
  }
  return ((borrowerData ?? []) as BorrowerDirectoryRecord[]).map((borrower) => ({
    id: borrower.id,
    version: borrower.version,
    legalName: borrower.legal_name,
    borrowerKind: borrower.borrower_kind,
    externalReference: borrower.external_reference,
    relationshipStartDate: borrower.relationship_start_date,
    primaryContact: contacts.get(borrower.id) ?? null,
  }));
}

export async function loadBorrowerDeals(context:ReadyContext,borrowerIds:string[]):Promise<DealSummary[]>{
  if(!borrowerIds.length)return[];
  const supabase=await createClient(),organizationId=context.activeOrganization.organizationId;
  const{data,error}=await supabase.from("deals").select("id, borrower_id, deal_number, name, product_type, requested_amount, approved_amount, stage, expected_close_date, updated_at")
    .eq("organization_id",organizationId).is("archived_at",null).in("borrower_id",borrowerIds).order("updated_at",{ascending:false});
  if(error)throw new Error("Unable to load company opportunity aggregates.");
  const names=new Map<string,string>();const{data:borrowers,error:borrowerError}=await supabase.from("borrowers").select("id, legal_name").eq("organization_id",organizationId).in("id",borrowerIds);
  if(borrowerError)throw new Error("Unable to load company opportunity aggregates.");for(const row of borrowers??[])names.set(row.id,row.legal_name);
  return((data??[]) as DealRow[]).map(row=>toSummary(row,names.get(row.borrower_id)??"Borrower unavailable"));
}

export async function loadCrmActivities(context:ReadyContext,page=1,search=""):Promise<CrmActivityRecord[]> {
  const supabase=await createClient(), organizationId=context.activeOrganization.organizationId;
  const matchingIds=await crmSearchIds(context,"activities",search);if(matchingIds&&!matchingIds.length)return[];
  const{from,to}=crmRange(page);let query=supabase.from("crm_activities").select("id, borrower_id, deal_id, activity_kind, subject, occurred_at, notes").eq("organization_id",organizationId).order("occurred_at",{ascending:false}).range(from,to);if(matchingIds)query=query.in("id",matchingIds);const {data,error}=await query;
  if(error) throw new Error("Unable to load CRM activities.");
  const borrowerIds=[...new Set((data??[]).map((row)=>row.borrower_id as string))], names=new Map<string,string>();
  if(borrowerIds.length){const{data:borrowers,error:borrowerError}=await supabase.from("borrowers").select("id, legal_name").eq("organization_id",organizationId).in("id",borrowerIds);if(borrowerError)throw new Error("Unable to load activity relationships.");for(const borrower of borrowers??[])names.set(borrower.id,borrower.legal_name);}
  return (data??[]).map((row)=>({id:row.id,borrowerId:row.borrower_id,borrowerName:names.get(row.borrower_id)??"Borrower unavailable",dealId:row.deal_id,kind:row.activity_kind,subject:row.subject,occurredAt:row.occurred_at,notes:row.notes}));
}

export async function loadCrmContacts(context:ReadyContext,page=1,search=""):Promise<CrmContactRecord[]> {
  const supabase=await createClient(), organizationId=context.activeOrganization.organizationId;
  const matchingIds=await crmSearchIds(context,"contacts",search);if(matchingIds&&!matchingIds.length)return[];
  const{from,to}=crmRange(page);let query=supabase.from("borrower_contacts").select("id, borrower_id, contact_kind, label, value, is_primary, is_verified, restricted_use, version").eq("organization_id",organizationId).is("archived_at",null).order("created_at",{ascending:false}).range(from,to);if(matchingIds)query=query.in("id",matchingIds);const {data,error}=await query;
  if(error) throw new Error("Unable to load CRM contacts.");
  const borrowerIds=[...new Set((data??[]).map(row=>row.borrower_id as string))], names=new Map<string,string>();
  if(borrowerIds.length){const{data:borrowers,error:borrowerError}=await supabase.from("borrowers").select("id, legal_name").eq("organization_id",organizationId).in("id",borrowerIds);if(borrowerError)throw new Error("Unable to load contact relationships.");for(const borrower of borrowers??[])names.set(borrower.id,borrower.legal_name);}
  return(data??[]).map(row=>({id:row.id,borrowerId:row.borrower_id,borrowerName:names.get(row.borrower_id)??"Borrower unavailable",kind:row.contact_kind,label:row.label,value:row.restricted_use?"Restricted":row.value,isPrimary:row.is_primary,isVerified:row.is_verified,restrictedUse:row.restricted_use,version:row.version}));
}

export async function loadCrmRelationships(context:ReadyContext,page=1,search=""):Promise<CrmRelationshipRecord[]> {
  const supabase=await createClient(), organizationId=context.activeOrganization.organizationId;
  const matchingIds=await crmSearchIds(context,"relationships",search);if(matchingIds&&!matchingIds.length)return[];
  const{from,to}=crmRange(page);let query=supabase.from("borrower_relationships").select("id, source_borrower_id, target_borrower_id, deal_id, relationship_kind, role_label, notes, is_active").eq("organization_id",organizationId).order("updated_at",{ascending:false}).range(from,to);if(matchingIds)query=query.in("id",matchingIds);const {data,error}=await query;
  if(error) throw new Error("Unable to load CRM relationships.");
  const borrowerIds=[...new Set((data??[]).flatMap(row=>[row.source_borrower_id,row.target_borrower_id].filter(Boolean) as string[]))], dealIds=[...new Set((data??[]).map(row=>row.deal_id as string|null).filter(Boolean) as string[])];
  const names=new Map<string,string>(), deals=new Map<string,string>();
  if(borrowerIds.length){const{data:borrowers,error:e}=await supabase.from("borrowers").select("id, legal_name").eq("organization_id",organizationId).in("id",borrowerIds);if(e)throw new Error("Unable to load relationship parties.");for(const row of borrowers??[])names.set(row.id,row.legal_name);}
  if(dealIds.length){const{data:dealRows,error:e}=await supabase.from("deals").select("id, name").eq("organization_id",organizationId).in("id",dealIds);if(e)throw new Error("Unable to load relationship opportunities.");for(const row of dealRows??[])deals.set(row.id,row.name);}
  return(data??[]).map(row=>({id:row.id,sourceBorrowerId:row.source_borrower_id,sourceName:names.get(row.source_borrower_id)??"Borrower unavailable",targetBorrowerId:row.target_borrower_id,targetName:row.target_borrower_id?names.get(row.target_borrower_id)??"Borrower unavailable":null,dealId:row.deal_id,dealName:row.deal_id?deals.get(row.deal_id)??"Opportunity unavailable":null,kind:row.relationship_kind,roleLabel:row.role_label,notes:row.notes,isActive:row.is_active}));
}

export async function loadDealTasks(context:ReadyContext,dealId?:string,page=1,search=""):Promise<DealTaskRecord[]> {
  const supabase=await createClient(), organizationId=context.activeOrganization.organizationId;
  const matchingIds=await crmSearchIds(context,"tasks",search);if(matchingIds&&!matchingIds.length)return[];
  const{from,to}=crmRange(page);let query=supabase.from("deal_tasks").select("id, deal_id, title, description, status, due_at, assigned_to, version").eq("organization_id",organizationId).order("due_at",{ascending:true,nullsFirst:false}).range(from,to);
  if(dealId)query=query.eq("deal_id",dealId);
  if(matchingIds)query=query.in("id",matchingIds);
  const{data,error}=await query;if(error)throw new Error("Unable to load operating tasks.");
  const dealIds=[...new Set((data??[]).map(row=>row.deal_id as string))], names=new Map<string,string>();
  if(dealIds.length){const{data:deals,error:dealError}=await supabase.from("deals").select("id, name").eq("organization_id",organizationId).in("id",dealIds);if(dealError)throw new Error("Unable to load task opportunities.");for(const deal of deals??[])names.set(deal.id,deal.name);}
  return(data??[]).map((row)=>({id:row.id,dealId:row.deal_id,dealName:names.get(row.deal_id)??"Opportunity unavailable",title:row.title,description:row.description,status:row.status,dueAt:row.due_at,assignedTo:row.assigned_to,version:row.version}));
}

export async function loadCrmPeople(context:ReadyContext,page=1,search=""):Promise<CrmPersonRecord[]> {
  const supabase=await createClient(),organizationId=context.activeOrganization.organizationId;
  const matchingIds=await crmSearchIds(context,"people",search);if(matchingIds&&!matchingIds.length)return[];
  const{from,to}=crmRange(page);let peopleQuery=supabase.from("crm_people").select("id, first_name, middle_name, last_name, preferred_name, job_title, notes, version").eq("organization_id",organizationId).is("archived_at",null).order("last_name").range(from,to);if(matchingIds)peopleQuery=peopleQuery.in("id",matchingIds);const{data:people,error:peopleError}=await peopleQuery;
  if(peopleError)throw new Error("Unable to load CRM people.");if(!people?.length)return[];
  const personIds=people.map(person=>person.id);
  const[{data:roles,error:rolesError},{data:contacts,error:contactsError}]=await Promise.all([
    supabase.from("crm_person_company_roles").select("person_id, borrower_id, role_label, ownership_percentage, is_primary").eq("organization_id",organizationId).in("person_id",personIds).is("ends_on",null).order("is_primary",{ascending:false}),
    supabase.from("crm_person_contacts").select("person_id, contact_kind, value, restricted_use, is_primary").eq("organization_id",organizationId).in("person_id",personIds).is("archived_at",null).order("is_primary",{ascending:false}),
  ]);
  if(rolesError||contactsError)throw new Error("Unable to load CRM people.");
  const roleByPerson=new Map<string,(typeof roles)[number]>();for(const role of roles??[])if(!roleByPerson.has(role.person_id))roleByPerson.set(role.person_id,role);
  const borrowerIds=[...new Set((roles??[]).map(role=>role.borrower_id as string))],borrowerNames=new Map<string,string>();
  if(borrowerIds.length){const{data,error}=await supabase.from("borrowers").select("id, legal_name").eq("organization_id",organizationId).in("id",borrowerIds);if(error)throw new Error("Unable to load person companies.");for(const row of data??[])borrowerNames.set(row.id,row.legal_name);}
  const contactByPerson=new Map<string,{email:string|null;phone:string|null}>();for(const contact of contacts??[]){const current=contactByPerson.get(contact.person_id)??{email:null,phone:null};const value=contact.restricted_use?"Restricted":contact.value;if(contact.contact_kind==="email"&&!current.email)current.email=value;if(contact.contact_kind==="phone"&&!current.phone)current.phone=value;contactByPerson.set(contact.person_id,current);}
  return(people??[]).flatMap(person=>{const role=roleByPerson.get(person.id);if(!role)return[];const contact=contactByPerson.get(person.id);return[{id:person.id,borrowerId:role.borrower_id,borrowerName:borrowerNames.get(role.borrower_id)??"Company unavailable",firstName:person.first_name,middleName:person.middle_name,lastName:person.last_name,preferredName:person.preferred_name,jobTitle:person.job_title,roleLabel:role.role_label,ownershipPercentage:role.ownership_percentage===null?null:Number(role.ownership_percentage),isPrimary:role.is_primary,email:contact?.email??null,phone:contact?.phone??null,notes:person.notes,version:person.version}];});
}

export async function loadCrmReferrals(context:ReadyContext,page=1,search=""):Promise<CrmReferralRecord[]> {
  const supabase=await createClient(),organizationId=context.activeOrganization.organizationId;
  const matchingIds=await crmSearchIds(context,"referrals",search);if(matchingIds&&!matchingIds.length)return[];
  const{from,to}=crmRange(page);let query=supabase.from("crm_referrals").select("id, borrower_id, source_borrower_id, source_person_id, deal_id, status, referred_at, estimated_value, notes, outcome, version").eq("organization_id",organizationId).order("referred_at",{ascending:false}).range(from,to);if(matchingIds)query=query.in("id",matchingIds);const{data,error}=await query;
  if(error)throw new Error("Unable to load CRM referrals.");
  const borrowerIds=[...new Set((data??[]).flatMap(row=>[row.borrower_id,row.source_borrower_id].filter(Boolean) as string[]))],personIds=[...new Set((data??[]).map(row=>row.source_person_id as string|null).filter(Boolean) as string[])],dealIds=[...new Set((data??[]).map(row=>row.deal_id as string|null).filter(Boolean) as string[])];
  const borrowerNames=new Map<string,string>(),personNames=new Map<string,string>(),dealNames=new Map<string,string>();
  await Promise.all([
    borrowerIds.length?supabase.from("borrowers").select("id, legal_name").eq("organization_id",organizationId).in("id",borrowerIds).then(({data:rows,error:e})=>{if(e)throw new Error("Unable to load referral companies.");for(const row of rows??[])borrowerNames.set(row.id,row.legal_name);}):Promise.resolve(),
    personIds.length?supabase.from("crm_people").select("id, first_name, last_name").eq("organization_id",organizationId).in("id",personIds).then(({data:rows,error:e})=>{if(e)throw new Error("Unable to load referral people.");for(const row of rows??[])personNames.set(row.id,`${row.first_name} ${row.last_name}`);}):Promise.resolve(),
    dealIds.length?supabase.from("deals").select("id, name").eq("organization_id",organizationId).in("id",dealIds).then(({data:rows,error:e})=>{if(e)throw new Error("Unable to load referral opportunities.");for(const row of rows??[])dealNames.set(row.id,row.name);}):Promise.resolve(),
  ]);
  return(data??[]).map(row=>({id:row.id,borrowerId:row.borrower_id,borrowerName:borrowerNames.get(row.borrower_id)??"Company unavailable",sourceName:row.source_person_id?personNames.get(row.source_person_id)??"Person unavailable":borrowerNames.get(row.source_borrower_id)??"Company unavailable",dealId:row.deal_id,dealName:row.deal_id?dealNames.get(row.deal_id)??"Opportunity unavailable":null,status:row.status,referredAt:row.referred_at,estimatedValue:row.estimated_value===null?null:Number(row.estimated_value),notes:row.notes,outcome:row.outcome,version:row.version}));
}

export async function loadCrmOperators(context:ReadyContext):Promise<CrmOperatorRecord[]>{
  const supabase=await createClient(),organizationId=context.activeOrganization.organizationId;
  const{data:members,error}=await supabase.from("organization_memberships").select("user_id, role").eq("organization_id",organizationId).eq("is_active",true).in("role",["owner","administrator","lender"]);
  if(error)throw new Error("Unable to load CRM operators.");const ids=(members??[]).map(row=>row.user_id as string);if(!ids.length)return[];
  const{data:profiles,error:profileError}=await supabase.from("profiles").select("user_id, display_name").in("user_id",ids);if(profileError)throw new Error("Unable to load CRM operators.");
  const names=new Map((profiles??[]).map(row=>[row.user_id as string,row.display_name as string|null]));return(members??[]).map(row=>({userId:row.user_id,displayName:names.get(row.user_id)??"Team member",role:row.role}));
}

export async function loadCrmArchivedRecords(context:ReadyContext,view:string):Promise<CrmArchivedRecord[]>{
  if(!["companies","people"].includes(view))return[];
  const supabase=await createClient();const{data,error}=await supabase.rpc("crm_archived_records",{p_organization_id:context.activeOrganization.organizationId,p_view:view});
  if(error)throw new Error("Unable to load archived CRM records.");
  return(data??[]).map((row:{id:unknown;label:unknown;version:unknown;entity:unknown})=>({id:row.id as string,label:row.label as string,version:Number(row.version),entity:row.entity as CrmArchivedRecord["entity"]}));
}

export async function loadCrmViewTotal(context:ReadyContext,view:string,search=""):Promise<number>{
  const supabase=await createClient(),organizationId=context.activeOrganization.organizationId,term=search.trim();
  if(term){
    if(view==="people"){const[people,contacts]=await Promise.all([crmSearchIds(context,"people",term),crmSearchIds(context,"contacts",term)]);return(people?.length??0)+(contacts?.length??0);}
    const ids=await crmSearchIds(context,view,term);return ids?.length??0;
  }
  if(view==="companies"){let q=supabase.from("borrowers").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).is("archived_at",null);if(term)q=q.ilike("legal_name",`%${term}%`);const{count,error}=await q;if(error)throw new Error("Unable to count CRM companies.");return count??0;}
  if(view==="people"){const[people,contacts]=await Promise.all([supabase.from("crm_people").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).is("archived_at",null),supabase.from("borrower_contacts").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).is("archived_at",null)]);if(people.error||contacts.error)throw new Error("Unable to count CRM people.");return(people.count??0)+(contacts.count??0);}
  const config:Record<string,{table:string;column:string;active?:boolean}>={relationships:{table:"borrower_relationships",column:"role_label"},opportunities:{table:"deals",column:"name"},activities:{table:"crm_activities",column:"subject"},referrals:{table:"crm_referrals",column:"notes"},calendar:{table:"crm_appointments",column:"subject"},tasks:{table:"deal_tasks",column:"title"}};
  const selected=config[view];if(!selected)return 0;let q=supabase.from(selected.table).select("id",{count:"exact",head:true}).eq("organization_id",organizationId);if(view==="opportunities")q=q.is("archived_at",null);if(term)q=q.ilike(selected.column,`%${term}%`);const{count,error}=await q;if(error)throw new Error("Unable to count CRM records.");return count??0;
}

export async function loadCrmAppointments(context:ReadyContext,page=1,search=""):Promise<CrmAppointmentRecord[]> {
  const supabase=await createClient(),organizationId=context.activeOrganization.organizationId;
  const matchingIds=await crmSearchIds(context,"calendar",search);if(matchingIds&&!matchingIds.length)return[];
  const{from,to}=crmRange(page);let query=supabase.from("crm_appointments").select("id, borrower_id, deal_id, subject, starts_at, ends_at, status, assigned_to, location, notes, version").eq("organization_id",organizationId).order("starts_at",{ascending:true}).range(from,to);if(matchingIds)query=query.in("id",matchingIds);const{data,error}=await query;
  if(error)throw new Error("Unable to load CRM appointments.");
  const borrowerIds=[...new Set((data??[]).map(row=>row.borrower_id as string))],dealIds=[...new Set((data??[]).map(row=>row.deal_id as string|null).filter(Boolean) as string[])],borrowerNames=new Map<string,string>(),dealNames=new Map<string,string>();
  await Promise.all([
    borrowerIds.length?supabase.from("borrowers").select("id, legal_name").eq("organization_id",organizationId).in("id",borrowerIds).then(({data:rows,error:e})=>{if(e)throw new Error("Unable to load appointment companies.");for(const row of rows??[])borrowerNames.set(row.id,row.legal_name);}):Promise.resolve(),
    dealIds.length?supabase.from("deals").select("id, name").eq("organization_id",organizationId).in("id",dealIds).then(({data:rows,error:e})=>{if(e)throw new Error("Unable to load appointment opportunities.");for(const row of rows??[])dealNames.set(row.id,row.name);}):Promise.resolve(),
  ]);
  return(data??[]).map(row=>({id:row.id,borrowerId:row.borrower_id,borrowerName:borrowerNames.get(row.borrower_id)??"Company unavailable",dealId:row.deal_id,dealName:row.deal_id?dealNames.get(row.deal_id)??"Opportunity unavailable":null,subject:row.subject,startsAt:row.starts_at,endsAt:row.ends_at,status:row.status,assignedTo:row.assigned_to,location:row.location,notes:row.notes,version:row.version}));
}

export async function loadCrmMetrics(context:ReadyContext):Promise<CrmMetrics>{
  const supabase=await createClient();
  const{data,error}=await supabase.rpc("crm_dashboard_metrics",{p_organization_id:context.activeOrganization.organizationId});
  if(error||!data||typeof data!=="object")throw new Error("Unable to load authoritative CRM metrics.");
  const row=data as Record<string,unknown>,number=(key:string)=>Number(row[key]??0);
  return{companies:number("companies"),people:number("people"),contactPoints:number("contactPoints"),relationships:number("relationships"),activities:number("activities"),referrals:number("referrals"),appointments:number("appointments"),tasks:number("tasks"),openTasks:number("openTasks"),opportunities:number("opportunities"),openOpportunities:number("openOpportunities"),activeExposure:number("activeExposure")};
}

export async function loadDealDetail(context: ReadyContext, dealId: string): Promise<DealDetail | null> {
  const supabase = await createClient();
  const organizationId = context.activeOrganization.organizationId;
  const { data, error } = await supabase.from("deals")
    .select("id, borrower_id, deal_number, name, product_type, purpose, requested_amount, approved_amount, stage, expected_close_date, updated_at, created_at, version")
    .eq("organization_id", organizationId).eq("id", dealId).is("archived_at", null).maybeSingle();
  if (error) throw new Error("Unable to load the deal.");
  if (!data) return null;
  if (!canReadInstitutionPipeline(context.activeOrganization.role)) {
    const { data: assignment, error: assignmentError } = await supabase.from("deal_assignments").select("deal_id")
      .eq("organization_id", organizationId).eq("deal_id", dealId).eq("user_id", context.userId).is("ended_at", null).maybeSingle();
    if (assignmentError) throw new Error("Unable to verify deal assignment.");
    if (!assignment) return null;
  }
  const [
    { data: borrower, error: borrowerError },
    { data: checklist, error: checklistError },
    { data: documents, error: documentsError },
    { data: documentVersions, error: documentVersionsError },
  ] = await Promise.all([
    supabase.from("borrowers").select("legal_name").eq("organization_id", organizationId).eq("id", data.borrower_id).maybeSingle(),
    supabase.from("application_checklist_items").select("id, label, category, status, is_required, due_date").eq("organization_id", organizationId).eq("deal_id", dealId).order("created_at"),
    supabase.from("deal_document_requirements").select("id, document_type, category, status, is_required, due_date").eq("organization_id", organizationId).eq("deal_id", dealId).order("created_at"),
    supabase.from("deal_documents")
      .select("id, requirement_id, logical_document_id, version_number, original_file_name, mime_type, size_bytes, sha256, security_status, uploaded_at, scanned_at, retained_until, legal_hold")
      .eq("organization_id", organizationId).eq("deal_id", dealId)
      .order("uploaded_at", { ascending: false }).limit(500),
  ]);
  if (borrowerError || checklistError || documentsError || documentVersionsError) throw new Error("Unable to load the deal readiness record.");
  const documentRows = (documentVersions ?? []) as DealDocumentRow[];
  const scanJobs = new Map<string, DocumentScanJobRow>();
  if (documentRows.length > 0) {
    const { data: jobs, error: jobsError } = await createAdminClient().from("document_scan_jobs")
      .select("document_id, status, attempt_count, max_attempts, last_error, updated_at")
      .eq("organization_id", organizationId).in("document_id", documentRows.map((row) => row.id));
    if (jobsError) throw new Error("Unable to load document scan operations.");
    for (const job of (jobs ?? []) as DocumentScanJobRow[]) scanJobs.set(job.document_id, job);
  }
  const summary = toSummary(data as DealRow, borrower?.legal_name ?? "Borrower unavailable");
  const mapItem = (item: { id: string; label?: string; document_type?: string; category: string; status: string; is_required: boolean; due_date: string | null }): ReadinessItem => ({
    id: item.id, label: item.label ?? item.document_type ?? "Unnamed requirement", category: item.category, status: item.status, required: item.is_required, dueDate: item.due_date,
  });
  return { ...summary, purpose: data.purpose, createdAt: data.created_at, version: data.version,
    readiness: deriveUnderwritingReadiness((checklist ?? []).map(mapItem), (documents ?? []).map(mapItem)),
    documentVersions: documentRows.map((row) => toDocumentVersion(row, scanJobs.get(row.id))) };
}

export async function loadUnderwritingWorkspace(context: ReadyContext, dealId: string): Promise<UnderwritingWorkspaceRecord> {
  const supabase = await createClient();
  const organizationId = context.activeOrganization.organizationId;
  const [{ data: module, error: moduleError }, { data: job, error: jobError }] = await Promise.all([
    supabase.from("organization_product_modules").select("organization_id, module_key, status, starts_at, ends_at")
      .eq("organization_id", organizationId).eq("module_key", "underwriting").maybeSingle(),
    supabase.from("underwriting_jobs").select("id, status, created_at, updated_at, completed_at, failure_code")
      .eq("organization_id", organizationId).eq("deal_id", dealId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (moduleError || jobError) throw new Error("Unable to load the Buddy Underwriter workspace.");
  const entitlements: ProductModuleEntitlement[] = module ? [{ organizationId: module.organization_id, module: module.module_key, status: module.status, startsAt: module.starts_at, endsAt: module.ends_at }] : [];
  return {
    moduleAccess: decideModuleAccess("underwriting", entitlements),
    latestJob: job ? { id: job.id, status: job.status, createdAt: job.created_at, updatedAt: job.updated_at, completedAt: job.completed_at, failureCode: job.failure_code } : null,
  };
}

export async function loadGoldenLoanWorkspace(context:ReadyContext,dealId:string):Promise<GoldenLoanWorkspaceRecord>{
  const s=await createClient(),organizationId=context.activeOrganization.organizationId;
  const[{data:memo,error:memoError},{data:decision,error:decisionError},{data:conditions,error:conditionError},{data:closing,error:closingError},{data:funding,error:fundingError},{data:servicing,error:servicingError}]=await Promise.all([
    s.from("credit_memos").select("id,status,certified_at").eq("organization_id",organizationId).eq("deal_id",dealId).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    s.from("credit_decisions").select("id,decision,decided_at").eq("organization_id",organizationId).eq("deal_id",dealId).order("decided_at",{ascending:false}).limit(1).maybeSingle(),
    s.from("credit_conditions").select("id,description,status").eq("organization_id",organizationId).eq("deal_id",dealId).order("created_at"),
    s.from("closing_requirements").select("id,title,status,is_required").eq("organization_id",organizationId).eq("deal_id",dealId).order("created_at"),
    s.from("funding_authorizations").select("id,amount,authorized_at").eq("organization_id",organizationId).eq("deal_id",dealId).maybeSingle(),
    s.from("servicing_accounts").select("id,account_number,principal_balance,next_review_date").eq("organization_id",organizationId).eq("deal_id",dealId).maybeSingle(),
  ]);
  if(memoError||decisionError||conditionError||closingError||fundingError||servicingError)throw new Error("Unable to load the governed loan lifecycle.");
  let covenants:{id:string;title:string;status:string;due_date:string}[]=[];
  if(servicing){const{data,error}=await s.from("portfolio_covenants").select("id,title,status,due_date").eq("organization_id",organizationId).eq("servicing_account_id",servicing.id).order("due_date");if(error)throw new Error("Unable to load portfolio covenants.");covenants=(data??[]) as typeof covenants;}
  return{memo:memo?{id:memo.id,status:memo.status,certifiedAt:memo.certified_at}:null,decision:decision?{id:decision.id,decision:decision.decision,decidedAt:decision.decided_at}:null,conditions:(conditions??[]).map(x=>({id:x.id,description:x.description,status:x.status})),closing:(closing??[]).map(x=>({id:x.id,title:x.title,status:x.status,required:x.is_required})),funding:funding?{id:funding.id,amount:Number(funding.amount),authorizedAt:funding.authorized_at}:null,servicing:servicing?{id:servicing.id,accountNumber:servicing.account_number,balance:Number(servicing.principal_balance),nextReviewDate:servicing.next_review_date}:null,covenants:covenants.map(x=>({id:x.id,title:x.title,status:x.status,dueDate:x.due_date}))};
}

export async function loadBorrowerDetail(context: ReadyContext, borrowerId: string): Promise<BorrowerDetail | null> {
  const supabase = await createClient();
  const organizationId = context.activeOrganization.organizationId;
  const [{ data: borrower, error: borrowerError }, { data: contacts, error: contactsError }, peopleResult, relationshipResult, activityResult, referralResult, appointmentResult, dealResult, taskResult, assignmentResult] = await Promise.all([
    supabase.from("borrowers").select("id, version, legal_name, borrower_kind, external_reference, relationship_start_date")
      .eq("organization_id", organizationId).eq("id", borrowerId).is("archived_at", null).maybeSingle(),
    supabase.from("borrower_contacts").select("id, contact_kind, label, value, is_primary, is_verified, restricted_use")
      .eq("organization_id", organizationId).eq("borrower_id", borrowerId).is("archived_at",null).order("is_primary", { ascending: false }),
    supabase.from("crm_person_company_roles").select("person_id, role_label, crm_people!inner(id, first_name, last_name, job_title)").eq("organization_id",organizationId).eq("borrower_id",borrowerId).is("ends_on",null),
    supabase.from("borrower_relationships").select("id, source_borrower_id, target_borrower_id, relationship_kind, role_label, is_active").eq("organization_id",organizationId).or(`source_borrower_id.eq.${borrowerId},target_borrower_id.eq.${borrowerId}`).order("updated_at",{ascending:false}).limit(50),
    supabase.from("crm_activities").select("id, subject, occurred_at").eq("organization_id",organizationId).eq("borrower_id",borrowerId).order("occurred_at",{ascending:false}).limit(20),
    supabase.from("crm_referrals").select("id, status, referred_at").eq("organization_id",organizationId).eq("borrower_id",borrowerId).order("referred_at",{ascending:false}).limit(20),
    supabase.from("crm_appointments").select("id, subject, status, starts_at").eq("organization_id",organizationId).eq("borrower_id",borrowerId).order("starts_at",{ascending:false}).limit(20),
    supabase.from("deals").select("id, name, stage").eq("organization_id",organizationId).eq("borrower_id",borrowerId).is("archived_at",null).order("updated_at",{ascending:false}),
    supabase.from("deal_tasks").select("id, deal_id, title, status, due_at, deals!inner(name, borrower_id)").eq("organization_id",organizationId).eq("deals.borrower_id",borrowerId).order("due_at",{ascending:true,nullsFirst:false}),
    supabase.from("borrower_assignments").select("user_id, assignment_role").eq("organization_id",organizationId).eq("borrower_id",borrowerId).is("ended_at",null).order("assigned_at"),
  ]);
  if (borrowerError || contactsError || peopleResult.error || relationshipResult.error || activityResult.error || referralResult.error || appointmentResult.error || dealResult.error || taskResult.error || assignmentResult.error) throw new Error("Unable to load the borrower relationship.");
  if (!borrower) return null;
  const relatedIds=[...new Set((relationshipResult.data??[]).flatMap(row=>[row.source_borrower_id,row.target_borrower_id].filter(id=>id&&id!==borrowerId) as string[]))],relatedNames=new Map<string,string>();
  if(relatedIds.length){const{data,error}=await supabase.from("borrowers").select("id, legal_name").eq("organization_id",organizationId).in("id",relatedIds);if(error)throw new Error("Unable to load relationship counterparties.");for(const row of data??[])relatedNames.set(row.id,row.legal_name);}
  const assignmentIds=(assignmentResult.data??[]).map(row=>row.user_id as string),profileNames=new Map<string,string>();
  if(assignmentIds.length){const{data,error}=await supabase.from("profiles").select("user_id, display_name").in("user_id",assignmentIds);if(error)throw new Error("Unable to load relationship managers.");for(const row of data??[])profileNames.set(row.user_id,row.display_name??"Team member");}
  return {
    id: borrower.id, version: borrower.version, legalName: borrower.legal_name, borrowerKind: borrower.borrower_kind,
    externalReference: borrower.external_reference, relationshipStartDate: borrower.relationship_start_date,
    contacts: (contacts ?? []).map((contact) => ({ id: contact.id, kind: contact.contact_kind, label: contact.label,
      value: contact.restricted_use ? "Restricted" : contact.value, isPrimary: contact.is_primary,
      isVerified: contact.is_verified, restrictedUse: contact.restricted_use })),
    people:(peopleResult.data??[]).map((row)=>{const person=Array.isArray(row.crm_people)?row.crm_people[0]:row.crm_people;return{id:row.person_id,name:person?`${person.first_name} ${person.last_name}`:"Person unavailable",title:person?.job_title??row.role_label};}),
    relationships:(relationshipResult.data??[]).map(row=>{const counterpart=row.source_borrower_id===borrowerId?row.target_borrower_id:row.source_borrower_id;return{id:row.id,counterpartName:counterpart?relatedNames.get(counterpart)??"Company unavailable":"Opportunity relationship",kind:row.relationship_kind,roleLabel:row.role_label,active:row.is_active};}),
    activities:(activityResult.data??[]).map(row=>({id:row.id,subject:row.subject,occurredAt:row.occurred_at})),
    referrals:(referralResult.data??[]).map(row=>({id:row.id,status:row.status,referredAt:row.referred_at})),
    appointments:(appointmentResult.data??[]).map(row=>({id:row.id,subject:row.subject,status:row.status,startsAt:row.starts_at})),
    opportunities:(dealResult.data??[]).map(row=>({id:row.id,name:row.name,stage:row.stage})),
    tasks:(taskResult.data??[]).map(row=>{const deal=Array.isArray(row.deals)?row.deals[0]:row.deals;return{id:row.id,dealId:row.deal_id,dealName:deal?.name??"Opportunity unavailable",title:row.title,status:row.status,dueAt:row.due_at};}),
    assignments:(assignmentResult.data??[]).map(row=>({userId:row.user_id,displayName:profileNames.get(row.user_id)??"Team member",role:row.assignment_role})),
  };
}

function toSummary(row: DealRow, borrowerName: string): DealSummary {
  return { id: row.id, borrowerId: row.borrower_id, borrowerName, dealNumber: row.deal_number, name: row.name,
    productType: row.product_type, requestedAmount: numberOrNull(row.requested_amount), approvedAmount: numberOrNull(row.approved_amount),
    stage: row.stage, expectedCloseDate: row.expected_close_date, updatedAt: row.updated_at };
}
function numberOrNull(value: number | string | null) { return value === null ? null : Number(value); }

export function toDocumentVersion(row: DealDocumentRow, scanJob?: DocumentScanJobRow): DealDocumentVersion {
  return {
    id: row.id, requirementId: row.requirement_id, logicalDocumentId: row.logical_document_id,
    versionNumber: row.version_number, fileName: row.original_file_name, mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes), sha256: row.sha256, securityStatus: row.security_status,
    uploadedAt: row.uploaded_at, scannedAt: row.scanned_at, retainedUntil: row.retained_until, legalHold: row.legal_hold,
    scanJob: scanJob ? {
      status: scanJob.status, attemptCount: scanJob.attempt_count, maxAttempts: scanJob.max_attempts,
      lastError: safeDocumentScanFailure(scanJob.last_error), updatedAt: scanJob.updated_at,
      recoverable: scanJob.status === "failed" && scanJob.attempt_count < scanJob.max_attempts && row.security_status === "quarantined",
    } : null,
  };
}
