import { createAdminClient } from "@/lib/supabase/admin";
import { runDocumentCleanup } from "@/lib/los/document-cleanup-worker";

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
  const cleanupJob={jobId:String(job.jobId),bucket:String(job.bucket),path:String(job.path),disposalPath:String(job.disposalPath)};
  try {
    const outcome=await runDocumentCleanup(cleanupJob,{
      move:async(from,to)=>{const {error:moveError}=await admin.storage.from(cleanupJob.bucket).move(from,to);if(moveError)throw moveError;},
      complete:async(jobId,disposalPath)=>{const {error:completionError}=await admin.rpc("record_document_cleanup_completed",{p_job_id:jobId,p_disposal_path:disposalPath});if(completionError)throw completionError;},
      fail:async(jobId,message)=>{const {error:failureError}=await admin.rpc("record_document_cleanup_failure",{p_job_id:jobId,p_error:message});if(failureError)throw failureError;},
    });
    return Response.json({processed:true,jobId:cleanupJob.jobId,status:outcome.status},INIT);
  } catch { return Response.json({error:"Cleanup recovery requires operator attention."},{status:502,...INIT}); }
}
