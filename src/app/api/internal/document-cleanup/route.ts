import { createAdminClient } from "@/lib/supabase/admin";

const INIT = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: Request) {
  if (process.env.BUDDY_DOCUMENT_CLEANUP_ENABLED !== "true") return Response.json({ processed: false, reason: "disabled" }, INIT);
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (cronSecret.length < 16 || request.headers.get("authorization") !== `Bearer ${cronSecret}`) return Response.json({ error: "Unauthorized." }, { status: 401, ...INIT });
  let admin; try { admin = createAdminClient(); } catch { return Response.json({ error: "Document service is unavailable." }, { status: 503, ...INIT }); }
  const { data, error } = await admin.rpc("claim_document_cleanup_job");
  const job = data as Record<string, unknown> | null;
  if (error) return Response.json({ error: "Cleanup queue is unavailable." }, { status: 502, ...INIT });
  if (!job) return Response.json({ processed: false, reason: "empty" }, INIT);
  const jobId = String(job.jobId), bucket = String(job.bucket), path = String(job.path), disposalPath = String(job.disposalPath);
  if (bucket !== "loan-documents" || !path || !disposalPath.startsWith("_disposal/")) {
    await admin.rpc("record_document_cleanup_failure", { p_job_id: jobId, p_error: "Invalid cleanup object identity." });
    return Response.json({ processed: true, jobId, status: "failed" }, INIT);
  }
  const { error: moveError } = await admin.storage.from(bucket).move(path, disposalPath);
  if (moveError) {
    await admin.rpc("record_document_cleanup_failure", { p_job_id: jobId, p_error: "Storage disposal move failed." });
    return Response.json({ processed: true, jobId, status: "retryable" }, INIT);
  }
  const { error: completionError } = await admin.rpc("record_document_cleanup_completed", { p_job_id: jobId, p_disposal_path: disposalPath });
  if (completionError) return Response.json({ error: "Cleanup evidence could not be recorded." }, { status: 502, ...INIT });
  return Response.json({ processed: true, jobId, status: "completed" }, INIT);
}
