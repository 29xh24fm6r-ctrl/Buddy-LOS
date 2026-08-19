import { parseScanSubmissionConfig, ScanSubmissionError } from "@/lib/los/document-scan-submission";
import { processDocumentScanJob } from "@/lib/los/document-scan-worker";
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
  try {
    const result = await processDocumentScanJob(admin, config);
    observe(result.processed ? result.status : result.reason, result.processed && result.status !== "awaiting_result" ? "warn" : "info");
    return Response.json(result, INIT);
  } catch (error) {
    if (error instanceof ScanSubmissionError && !error.consumesAttempt) {
      observe("scanner_unavailable", "warn");
      return Response.json(
        { error: "scanner_unavailable", code: error.code },
        { status: 503, ...INIT },
      );
    }
    observe("unavailable", "error");
    return Response.json({ error: "Scan queue is unavailable." }, { status: 502, ...INIT });
  }
}
