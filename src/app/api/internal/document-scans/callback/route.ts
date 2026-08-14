import { parseDocumentScanCallback, verifyScannerSignature } from "@/lib/los/document-scan-callback";
import { documentsEnabledForOrganization } from "@/lib/config/foundation-status";
import { sha256Hex } from "@/lib/los/document-upload";
import { createAdminClient } from "@/lib/supabase/admin";

const RESPONSE_INIT = { headers: { "Cache-Control": "no-store" } };
const MAX_BODY_BYTES = 32_768;

export async function POST(request: Request) {
  if (process.env.BUDDY_DOCUMENT_SCANNING_ENABLED !== "true")
    return Response.json({ error: "Document scanning is not enabled." }, { status: 503, ...RESPONSE_INIT });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "Invalid request." }, { status: 415, ...RESPONSE_INIT });

  const rawBody = await request.text();
  if (!rawBody || Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES)
    return Response.json({ error: "Invalid request." }, { status: 413, ...RESPONSE_INIT });
  const secret = process.env.BUDDY_DOCUMENT_SCANNER_WEBHOOK_SECRET ?? "";
  if (!verifyScannerSignature(rawBody, request.headers.get("x-buddy-scanner-timestamp"), request.headers.get("x-buddy-scanner-signature"), secret))
    return Response.json({ error: "Invalid scanner authentication." }, { status: 401, ...RESPONSE_INIT });

  let callback;
  try { callback = parseDocumentScanCallback(JSON.parse(rawBody)); } catch { callback = null; }
  if (!callback) return Response.json({ error: "Invalid scan result." }, { status: 400, ...RESPONSE_INIT });
  if (!documentsEnabledForOrganization(callback.organizationId))
    return Response.json({ error: "Documents are not commissioned for this institution." }, { status: 403, ...RESPONSE_INIT });

  let admin;
  try { admin = createAdminClient(); } catch {
    return Response.json({ error: "Document service is unavailable." }, { status: 503, ...RESPONSE_INIT });
  }
  const { data: document, error: documentError } = await admin.from("deal_documents")
    .select("id,organization_id,storage_bucket,storage_path,size_bytes,mime_type,sha256,security_status")
    .eq("id", callback.documentId).eq("organization_id", callback.organizationId).maybeSingle();
  if (documentError || !document || !["quarantined", "scanning"].includes(document.security_status))
    return Response.json({ error: "Document is not eligible for scan completion." }, { status: 409, ...RESPONSE_INIT });
  if (document.storage_bucket !== "loan-documents" || document.sha256 !== callback.sha256)
    return Response.json({ error: "Scan evidence does not match the reserved document." }, { status: 409, ...RESPONSE_INIT });

  const { data: blob, error: readError } = await admin.storage.from("loan-documents").download(document.storage_path, {}, { cache: "no-store" });
  if (readError || !blob || blob.size !== Number(document.size_bytes) || (blob.type !== "" && blob.type !== document.mime_type))
    return Response.json({ error: "Stored document could not be verified." }, { status: 409, ...RESPONSE_INIT });
  if (await sha256Hex(blob) !== callback.sha256)
    return Response.json({ error: "Stored document hash mismatch." }, { status: 409, ...RESPONSE_INIT });

  const { data, error } = await admin.rpc("record_document_scan_result_v2", {
    p_organization_id: callback.organizationId, p_document_id: callback.documentId,
    p_scanner_provider: callback.provider, p_scanner_run_id: callback.runId,
    p_result: callback.result, p_sha256: callback.sha256,
    p_engine_version: callback.engineVersion, p_signature_version: callback.signatureVersion,
    p_detail: callback.detail,
  });
  if (error) return Response.json({ error: "Scan result could not be recorded." }, { status: 502, ...RESPONSE_INIT });
  return Response.json(data, RESPONSE_INIT);
}
