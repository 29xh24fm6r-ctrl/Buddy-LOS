import { logDocumentOperation } from "@/lib/operations/document-operations-log";
import { createAdminClient } from "@/lib/supabase/admin";

const INIT = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id");
  const finish = (outcome: string, level: "info" | "warn" | "error" = "info") =>
    logDocumentOperation({ operation: "health", outcome, requestId, durationMs: Date.now() - startedAt, level });

  if (process.env.BUDDY_DOCUMENT_OPERATIONS_ENABLED !== "true") {
    finish("disabled");
    return Response.json({ available: false, reason: "disabled" }, INIT);
  }
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 32 || request.headers.get("authorization") !== `Bearer ${secret}`) {
    finish("unauthorized", "warn");
    return Response.json({ error: "Unauthorized." }, { status: 401, ...INIT });
  }
  let admin;
  try { admin = createAdminClient(); } catch {
    finish("unavailable", "error");
    return Response.json({ error: "Document operations are unavailable." }, { status: 503, ...INIT });
  }
  const { data, error } = await admin.rpc("get_document_operations_health");
  if (error || !data) {
    finish("unavailable", "error");
    return Response.json({ error: "Document operations are unavailable." }, { status: 502, ...INIT });
  }
  finish("health_reported");
  return Response.json(data, INIT);
}
