import type { SupabaseClient } from "@supabase/supabase-js";

import { sha256Hex } from "@/lib/los/document-upload";
import {
  type ScanSubmissionConfig,
  ScanSubmissionError,
  submitDocumentScan,
} from "@/lib/los/document-scan-submission";

export type ScanDispatchResult =
  | { processed: false; reason: "empty" }
  | { processed: true; jobId: string; status: "awaiting_result" | "retryable" | "failed" };

export async function processDocumentScanJob(
  admin: SupabaseClient,
  config: ScanSubmissionConfig,
  documentId?: string,
): Promise<ScanDispatchResult> {
  const claim = documentId
    ? await admin.rpc("claim_document_scan_job_for_document", { p_document_id: documentId })
    : await admin.rpc("claim_document_scan_job");
  const job = claim.data as Record<string, unknown> | null;
  if (claim.error) throw new Error("Scan queue is unavailable.");
  if (!job) return { processed: false, reason: "empty" };

  const jobId = String(job.jobId);
  const organizationId = String(job.organizationId);
  const claimedDocumentId = String(job.documentId);
  const path = String(job.path);
  const mimeType = String(job.mimeType);
  const sha256 = String(job.sha256);

  try {
    const { data: blob, error: readError } = await admin.storage
      .from("loan-documents")
      .download(path, {}, { cache: "no-store" });
    if (
      readError ||
      !blob ||
      blob.size !== Number(job.sizeBytes) ||
      (blob.type !== "" && blob.type !== mimeType) ||
      (await sha256Hex(blob)) !== sha256
    )
      throw new ScanSubmissionError("Stored document failed pre-submission verification.", false);

    const submission = await submitDocumentScan(config, {
      jobId,
      organizationId,
      documentId: claimedDocumentId,
      sha256,
      mimeType,
      blob,
    });
    const { error: recordError } = await admin.rpc("record_document_scan_submission", {
      p_job_id: jobId,
      p_provider: config.provider,
      p_provider_run_id: submission.runId,
    });
    if (recordError) throw new ScanSubmissionError("Scanner submission could not be recorded.", true);
    return { processed: true, jobId, status: "awaiting_result" };
  } catch (caught) {
    const failure =
      caught instanceof ScanSubmissionError
        ? caught
        : new ScanSubmissionError("Scanner submission failed.", true);
    const status = failure.retryable ? "retryable" : "failed";
    await admin.rpc("record_document_scan_submission_failure", {
      p_job_id: jobId,
      p_error: failure.message,
      p_retryable: failure.retryable,
    });
    return { processed: true, jobId, status };
  }
}
