import "server-only";
import { createClient } from "@/lib/supabase/server";
import { canReadInstitutionPipeline, type BorrowerSummary, type DealSummary } from "./read-model";
import type { AccessContext } from "@/lib/auth/access-context";
import { deriveUnderwritingReadiness, type ReadinessItem, type UnderwritingReadiness } from "./underwriting-readiness";

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

export type DealDocumentVersion = {
  id: string; requirementId: string | null; logicalDocumentId: string; versionNumber: number;
  fileName: string; mimeType: string; sizeBytes: number; sha256: string | null;
  securityStatus: string; uploadedAt: string; scannedAt: string | null; retainedUntil: string | null; legalHold: boolean;
};

export type DealDetail = DealSummary & {
  purpose: string | null; createdAt: string; version: number; readiness: UnderwritingReadiness;
  documentVersions: DealDocumentVersion[];
};
export type BorrowerDetail = {
  id: string; legalName: string; borrowerKind: string; externalReference: string | null;
  relationshipStartDate: string | null; contacts: { id: string; kind: string; label: string | null; value: string; isPrimary: boolean; isVerified: boolean; restrictedUse: boolean }[];
};

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
  const summary = toSummary(data as DealRow, borrower?.legal_name ?? "Borrower unavailable");
  const mapItem = (item: { id: string; label?: string; document_type?: string; category: string; status: string; is_required: boolean; due_date: string | null }): ReadinessItem => ({
    id: item.id, label: item.label ?? item.document_type ?? "Unnamed requirement", category: item.category, status: item.status, required: item.is_required, dueDate: item.due_date,
  });
  return { ...summary, purpose: data.purpose, createdAt: data.created_at, version: data.version,
    readiness: deriveUnderwritingReadiness((checklist ?? []).map(mapItem), (documents ?? []).map(mapItem)),
    documentVersions: ((documentVersions ?? []) as DealDocumentRow[]).map(toDocumentVersion) };
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

export function toDocumentVersion(row: DealDocumentRow): DealDocumentVersion {
  return {
    id: row.id, requirementId: row.requirement_id, logicalDocumentId: row.logical_document_id,
    versionNumber: row.version_number, fileName: row.original_file_name, mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes), sha256: row.sha256, securityStatus: row.security_status,
    uploadedAt: row.uploaded_at, scannedAt: row.scanned_at, retainedUntil: row.retained_until, legalHold: row.legal_hold,
  };
}
