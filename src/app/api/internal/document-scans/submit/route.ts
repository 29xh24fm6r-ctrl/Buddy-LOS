import { sha256Hex } from "@/lib/los/document-upload";
import { parseScanSubmissionConfig, ScanSubmissionError, submitDocumentScan } from "@/lib/los/document-scan-submission";
import { createAdminClient } from "@/lib/supabase/admin";
import { logDocumentOperation } from "@/lib/operations/document-operations-log";

const INIT = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: Request) {
  const startedAt=Date.now(),requestId=request.headers.get("x-vercel-id");
  const observe=(outcome:string,level:"info"|"warn"|"error"="info")=>logDocumentOperation({operation:"scan_submit",outcome,requestId,durationMs:Date.now()-startedAt,level});
  if (process.env.BUDDY_DOCUMENT_SCANNING_ENABLED !== "true") { observe("disabled"); return Response.json({ processed: false, reason: "disabled" }, INIT); }
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (cronSecret.length < 16 || request.headers.get("authorization") !== `Bearer ${cronSecret}`) { observe("unauthorized","warn"); return Response.json({ error: "Unauthorized." }, { status: 401, ...INIT }); }
  const config = parseScanSubmissionConfig(process.env);
  if (!config) { observe("unconfigured","warn"); return Response.json({ error: "Scanner submission is not configured." }, { status: 503, ...INIT }); }
  let admin; try { admin = createAdminClient(); } catch { observe("unavailable","error"); return Response.json({ error: "Document service is unavailable." }, { status: 503, ...INIT }); }
  const { data, error } = await admin.rpc("claim_document_scan_job");
  const job = data as Record<string, unknown> | null;
  if (error) { observe("unavailable","error"); return Response.json({ error: "Scan queue is unavailable." }, { status: 502, ...INIT }); }
  if (!job) { observe("empty"); return Response.json({ processed: false, reason: "empty" }, INIT); }
  const jobId = String(job.jobId), organizationId = String(job.organizationId), documentId = String(job.documentId), path = String(job.path), mimeType = String(job.mimeType), sha256 = String(job.sha256);
  try {
    const { data: blob, error: readError } = await admin.storage.from("loan-documents").download(path, {}, { cache: "no-store" });
    if (readError || !blob || blob.size !== Number(job.sizeBytes) || (blob.type !== "" && blob.type !== mimeType) || await sha256Hex(blob) !== sha256) throw new ScanSubmissionError("Stored document failed pre-submission verification.", false);
    const submission = await submitDocumentScan(config, { jobId, organizationId, documentId, sha256, mimeType, blob });
    const { error: recordError } = await admin.rpc("record_document_scan_submission", { p_job_id: jobId, p_provider: config.provider, p_provider_run_id: submission.runId });
    if (recordError) throw new ScanSubmissionError("Scanner submission could not be recorded.", true);
    observe("awaiting_result"); return Response.json({ processed: true, jobId, status: "awaiting_result" }, INIT);
  } catch (caught) {
    const failure = caught instanceof ScanSubmissionError ? caught : new ScanSubmissionError("Scanner submission failed.", true);
    await admin.rpc("record_document_scan_submission_failure", { p_job_id: jobId, p_error: failure.message, p_retryable: failure.retryable });
    observe(failure.retryable ? "retryable" : "failed",failure.retryable ? "warn" : "error");
    return Response.json({ processed: true, jobId, status: failure.retryable ? "retryable" : "failed" }, INIT);
  }
}
