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
  borrower_kind: string; external_reference: string | null; relationship_start_date: string | null;
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
  id: string; legalName: string; borrowerKind: string; externalReference: string | null;
  relationshipStartDate: string | null; contacts: { id: string; kind: string; label: string | null; value: string; isPrimary: boolean; isVerified: boolean; restrictedUse: boolean }[];
};
export type CrmActivityRecord = { id:string; borrowerId:string; borrowerName:string; dealId:string|null; kind:string; subject:string; occurredAt:string; notes:string|null };
export type CrmContactRecord = { id:string; borrowerId:string; borrowerName:string; kind:string; label:string|null; value:string; isPrimary:boolean; isVerified:boolean; restrictedUse:boolean };
export type CrmRelationshipRecord = { id:string; sourceBorrowerId:string; sourceName:string; targetBorrowerId:string|null; targetName:string|null; dealId:string|null; dealName:string|null; kind:string; roleLabel:string|null; notes:string|null; isActive:boolean };
export type DealTaskRecord = { id:string; dealId:string; dealName:string; title:string; description:string|null; status:string; dueAt:string|null; assignedTo:string|null; version:number };

export async function loadCommandCenterDeals(context: ReadyContext): Promise<DealSummary[]> {
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
    .eq("organization_id", organizationId).is("archived_at", null).order("updated_at", { ascending: false }).limit(200);
  if (allowedDealIds) query = query.in("id", allowedDealIds);
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

export async function loadBorrowerDirectory(context: ReadyContext): Promise<BorrowerSummary[]> {
  const supabase = await createClient();
  const organizationId = context.activeOrganization.organizationId;
  const [{ data: borrowerData, error: borrowerError }, { data: contactData, error: contactError }] = await Promise.all([
    supabase.from("borrowers")
      .select("id, legal_name, borrower_kind, external_reference, relationship_start_date")
      .eq("organization_id", organizationId).is("archived_at", null).order("legal_name").limit(500),
    supabase.from("borrower_contacts")
      .select("borrower_id, value, restricted_use")
      .eq("organization_id", organizationId).eq("is_primary", true).order("created_at").limit(500),
  ]);
  if (borrowerError || contactError) throw new Error("Unable to load the borrower directory.");
  const contacts = new Map<string, string>();
  for (const contact of contactData ?? []) {
    if (!contacts.has(contact.borrower_id)) contacts.set(contact.borrower_id, contact.restricted_use ? "Restricted" : contact.value);
  }
  return ((borrowerData ?? []) as BorrowerDirectoryRecord[]).map((borrower) => ({
    id: borrower.id,
    legalName: borrower.legal_name,
    borrowerKind: borrower.borrower_kind,
    externalReference: borrower.external_reference,
    relationshipStartDate: borrower.relationship_start_date,
    primaryContact: contacts.get(borrower.id) ?? null,
  }));
}

export async function loadCrmActivities(context:ReadyContext):Promise<CrmActivityRecord[]> {
  const supabase=await createClient(), organizationId=context.activeOrganization.organizationId;
  const {data,error}=await supabase.from("crm_activities").select("id, borrower_id, deal_id, activity_kind, subject, occurred_at, notes").eq("organization_id",organizationId).order("occurred_at",{ascending:false}).limit(100);
  if(error) throw new Error("Unable to load CRM activities.");
  const borrowerIds=[...new Set((data??[]).map((row)=>row.borrower_id as string))], names=new Map<string,string>();
  if(borrowerIds.length){const{data:borrowers,error:borrowerError}=await supabase.from("borrowers").select("id, legal_name").eq("organization_id",organizationId).in("id",borrowerIds);if(borrowerError)throw new Error("Unable to load activity relationships.");for(const borrower of borrowers??[])names.set(borrower.id,borrower.legal_name);}
  return (data??[]).map((row)=>({id:row.id,borrowerId:row.borrower_id,borrowerName:names.get(row.borrower_id)??"Borrower unavailable",dealId:row.deal_id,kind:row.activity_kind,subject:row.subject,occurredAt:row.occurred_at,notes:row.notes}));
}

export async function loadCrmContacts(context:ReadyContext):Promise<CrmContactRecord[]> {
  const supabase=await createClient(), organizationId=context.activeOrganization.organizationId;
  const {data,error}=await supabase.from("borrower_contacts").select("id, borrower_id, contact_kind, label, value, is_primary, is_verified, restricted_use").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(500);
  if(error) throw new Error("Unable to load CRM contacts.");
  const borrowerIds=[...new Set((data??[]).map(row=>row.borrower_id as string))], names=new Map<string,string>();
  if(borrowerIds.length){const{data:borrowers,error:borrowerError}=await supabase.from("borrowers").select("id, legal_name").eq("organization_id",organizationId).in("id",borrowerIds);if(borrowerError)throw new Error("Unable to load contact relationships.");for(const borrower of borrowers??[])names.set(borrower.id,borrower.legal_name);}
  return(data??[]).map(row=>({id:row.id,borrowerId:row.borrower_id,borrowerName:names.get(row.borrower_id)??"Borrower unavailable",kind:row.contact_kind,label:row.label,value:row.restricted_use?"Restricted":row.value,isPrimary:row.is_primary,isVerified:row.is_verified,restrictedUse:row.restricted_use}));
}

export async function loadCrmRelationships(context:ReadyContext):Promise<CrmRelationshipRecord[]> {
  const supabase=await createClient(), organizationId=context.activeOrganization.organizationId;
  const {data,error}=await supabase.from("borrower_relationships").select("id, source_borrower_id, target_borrower_id, deal_id, relationship_kind, role_label, notes, is_active").eq("organization_id",organizationId).order("updated_at",{ascending:false}).limit(500);
  if(error) throw new Error("Unable to load CRM relationships.");
  const borrowerIds=[...new Set((data??[]).flatMap(row=>[row.source_borrower_id,row.target_borrower_id].filter(Boolean) as string[]))], dealIds=[...new Set((data??[]).map(row=>row.deal_id as string|null).filter(Boolean) as string[])];
  const names=new Map<string,string>(), deals=new Map<string,string>();
  if(borrowerIds.length){const{data:borrowers,error:e}=await supabase.from("borrowers").select("id, legal_name").eq("organization_id",organizationId).in("id",borrowerIds);if(e)throw new Error("Unable to load relationship parties.");for(const row of borrowers??[])names.set(row.id,row.legal_name);}
  if(dealIds.length){const{data:dealRows,error:e}=await supabase.from("deals").select("id, name").eq("organization_id",organizationId).in("id",dealIds);if(e)throw new Error("Unable to load relationship opportunities.");for(const row of dealRows??[])deals.set(row.id,row.name);}
  return(data??[]).map(row=>({id:row.id,sourceBorrowerId:row.source_borrower_id,sourceName:names.get(row.source_borrower_id)??"Borrower unavailable",targetBorrowerId:row.target_borrower_id,targetName:row.target_borrower_id?names.get(row.target_borrower_id)??"Borrower unavailable":null,dealId:row.deal_id,dealName:row.deal_id?deals.get(row.deal_id)??"Opportunity unavailable":null,kind:row.relationship_kind,roleLabel:row.role_label,notes:row.notes,isActive:row.is_active}));
}

export async function loadDealTasks(context:ReadyContext,dealId?:string):Promise<DealTaskRecord[]> {
  const supabase=await createClient(), organizationId=context.activeOrganization.organizationId;
  let query=supabase.from("deal_tasks").select("id, deal_id, title, description, status, due_at, assigned_to, version").eq("organization_id",organizationId).order("due_at",{ascending:true,nullsFirst:false}).limit(200);
  if(dealId)query=query.eq("deal_id",dealId);
  const{data,error}=await query;if(error)throw new Error("Unable to load operating tasks.");
  const dealIds=[...new Set((data??[]).map(row=>row.deal_id as string))], names=new Map<string,string>();
  if(dealIds.length){const{data:deals,error:dealError}=await supabase.from("deals").select("id, name").eq("organization_id",organizationId).in("id",dealIds);if(dealError)throw new Error("Unable to load task opportunities.");for(const deal of deals??[])names.set(deal.id,deal.name);}
  return(data??[]).map((row)=>({id:row.id,dealId:row.deal_id,dealName:names.get(row.deal_id)??"Opportunity unavailable",title:row.title,description:row.description,status:row.status,dueAt:row.due_at,assignedTo:row.assigned_to,version:row.version}));
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
  if (!canReadInstitutionPipeline(context.activeOrganization.role)) {
    const { data: relatedDeals, error: dealsError } = await supabase.from("deals").select("id")
      .eq("organization_id", organizationId).eq("borrower_id", borrowerId).is("archived_at", null);
    if (dealsError) throw new Error("Unable to verify borrower deal access.");
    const dealIds = (relatedDeals ?? []).map((deal) => deal.id as string);
    if (dealIds.length === 0) return null;
    const { data: assignment, error: assignmentError } = await supabase.from("deal_assignments").select("deal_id")
      .eq("organization_id", organizationId).eq("user_id", context.userId).is("ended_at", null).in("deal_id", dealIds).limit(1).maybeSingle();
    if (assignmentError) throw new Error("Unable to verify borrower assignment.");
    if (!assignment) return null;
  }
  const [{ data: borrower, error: borrowerError }, { data: contacts, error: contactsError }] = await Promise.all([
    supabase.from("borrowers").select("id, legal_name, borrower_kind, external_reference, relationship_start_date")
      .eq("organization_id", organizationId).eq("id", borrowerId).is("archived_at", null).maybeSingle(),
    supabase.from("borrower_contacts").select("id, contact_kind, label, value, is_primary, is_verified, restricted_use")
      .eq("organization_id", organizationId).eq("borrower_id", borrowerId).order("is_primary", { ascending: false }),
  ]);
  if (borrowerError || contactsError) throw new Error("Unable to load the borrower relationship.");
  if (!borrower) return null;
  return {
    id: borrower.id, legalName: borrower.legal_name, borrowerKind: borrower.borrower_kind,
    externalReference: borrower.external_reference, relationshipStartDate: borrower.relationship_start_date,
    contacts: (contacts ?? []).map((contact) => ({ id: contact.id, kind: contact.contact_kind, label: contact.label,
      value: contact.restricted_use ? "Restricted" : contact.value, isPrimary: contact.is_primary,
      isVerified: contact.is_verified, restrictedUse: contact.restricted_use })),
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
