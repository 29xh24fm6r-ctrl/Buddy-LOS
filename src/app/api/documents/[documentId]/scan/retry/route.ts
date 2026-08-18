import { NextResponse } from "next/server";
import { loadAccessContext } from "@/lib/auth/session";
import { documentsEnabledForOrganization } from "@/lib/config/foundation-status";
import { canRecoverDocumentScan, parseDocumentScanRecoveryInput } from "@/lib/los/document-scan-recovery";
import { parseScanSubmissionConfig } from "@/lib/los/document-scan-submission";
import { processDocumentScanJob } from "@/lib/los/document-scan-worker";
import { isUuid } from "@/lib/los/document-upload";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  if (request.headers.get("x-buddy-request") !== "document-scan-recovery") return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return NextResponse.json({ error: "invalid_request" }, { status: 413 });
  const context = await loadAccessContext();
  if (context.kind !== "ready") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { documentId } = await params;
  if (!isUuid(documentId) || !canRecoverDocumentScan(context.activeOrganization.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const organizationId = context.activeOrganization.organizationId;
  if (!documentsEnabledForOrganization(organizationId) || process.env.BUDDY_DOCUMENT_SCANNING_ENABLED !== "true") return NextResponse.json({ error: "not_enabled" }, { status: 503 });
  const config = parseScanSubmissionConfig(process.env);
  if (!config) return NextResponse.json({ error: "scanner_unavailable" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  const input = parseDocumentScanRecoveryInput(body);
  if (!input) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const admin = createAdminClient();
  const recovery = await admin.rpc("requeue_failed_document_scan_job", {
    p_organization_id: organizationId,
    p_document_id: documentId,
    p_actor_user_id: context.userId,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
  });
  if (recovery.error) return NextResponse.json({ error: "scan_not_recoverable" }, { status: 409 });
  const dispatch = await processDocumentScanJob(admin, config, documentId);
  return NextResponse.json({ recovery: recovery.data, dispatch }, { status: 202 });
}
