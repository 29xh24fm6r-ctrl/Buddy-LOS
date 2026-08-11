import { sha256Hex } from "@/lib/los/document-upload";
import { parseScanSubmissionConfig, ScanSubmissionError, submitDocumentScan } from "@/lib/los/document-scan-submission";
import { createAdminClient } from "@/lib/supabase/admin";

const INIT = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: Request) {
  if (process.env.BUDDY_DOCUMENT_SCANNING_ENABLED !== "true") return Response.json({ processed: false, reason: "disabled" }, INIT);
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (cronSecret.length < 16 || request.headers.get("authorization") !== `Bearer ${cronSecret}`) return Response.json({ error: "Unauthorized." }, { status: 401, ...INIT });
  const config = parseScanSubmissionConfig(process.env);
  if (!config) return Response.json({ error: "Scanner submission is not configured." }, { status: 503, ...INIT });
  let admin; try { admin = createAdminClient(); } catch { return Response.json({ error: "Document service is unavailable." }, { status: 503, ...INIT }); }
  const { data, error } = await admin.rpc("claim_document_scan_job");
  const job = data as Record<string, unknown> | null;
  if (error) return Response.json({ error: "Scan queue is unavailable." }, { status: 502, ...INIT });
  if (!job) return Response.json({ processed: false, reason: "empty" }, INIT);
  const jobId = String(job.jobId), organizationId = String(job.organizationId), documentId = String(job.documentId), path = String(job.path), mimeType = String(job.mimeType), sha256 = String(job.sha256);
  try {
    const { data: blob, error: readError } = await admin.storage.from("loan-documents").download(path, {}, { cache: "no-store" });
    if (readError || !blob || blob.size !== Number(job.sizeBytes) || (blob.type !== "" && blob.type !== mimeType) || await sha256Hex(blob) !== sha256) throw new ScanSubmissionError("Stored document failed pre-submission verification.", false);
    const submission = await submitDocumentScan(config, { jobId, organizationId, documentId, sha256, mimeType, blob });
    const { error: recordError } = await admin.rpc("record_document_scan_submission", { p_job_id: jobId, p_provider: config.provider, p_provider_run_id: submission.runId });
    if (recordError) throw new ScanSubmissionError("Scanner submission could not be recorded.", true);
    return Response.json({ processed: true, jobId, status: "awaiting_result" }, INIT);
  } catch (caught) {
    const failure = caught instanceof ScanSubmissionError ? caught : new ScanSubmissionError("Scanner submission failed.", true);
    await admin.rpc("record_document_scan_submission_failure", { p_job_id: jobId, p_error: failure.message, p_retryable: failure.retryable });
    return Response.json({ processed: true, jobId, status: failure.retryable ? "retryable" : "failed" }, INIT);
  }
}
