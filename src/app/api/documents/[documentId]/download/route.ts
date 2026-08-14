import { loadAccessContext } from "@/lib/auth/session";
import { documentsEnabledForOrganization } from "@/lib/config/foundation-status";
import {
  DOCUMENT_DOWNLOAD_TTL_SECONDS,
  isUuid,
  parseDocumentAuthorization,
  parseDocumentDownloadRequest,
  remainingAuthorizationSeconds,
} from "@/lib/los/document-download";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const RESPONSE_INIT = {
  headers: {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  },
} as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  if (process.env.BUDDY_DOCUMENT_DOWNLOADS_ENABLED !== "true")
    return Response.json({ error: "Document downloads are not enabled." }, { status: 503, ...RESPONSE_INIT });
  if (request.headers.get("x-buddy-request") !== "document-download")
    return Response.json({ error: "Invalid request." }, { status: 403, ...RESPONSE_INIT });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return Response.json({ error: "Invalid request." }, { status: 415, ...RESPONSE_INIT });
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 4096)
    return Response.json({ error: "Invalid request." }, { status: 413, ...RESPONSE_INIT });

  const { documentId } = await params;
  if (!isUuid(documentId))
    return Response.json({ error: "Invalid document." }, { status: 400, ...RESPONSE_INIT });

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 4096)
      return Response.json({ error: "Invalid request." }, { status: 413, ...RESPONSE_INIT });
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400, ...RESPONSE_INIT });
  }
  const input = parseDocumentDownloadRequest(body);
  if (!input) return Response.json({ error: "Invalid request." }, { status: 400, ...RESPONSE_INIT });

  const context = await loadAccessContext();
  if (context.kind === "unauthenticated")
    return Response.json({ error: "Authentication required." }, { status: 401, ...RESPONSE_INIT });
  if (context.kind !== "ready")
    return Response.json({ error: "Institution access required." }, { status: 403, ...RESPONSE_INIT });
  if (!documentsEnabledForOrganization(context.activeOrganization.organizationId))
    return Response.json({ error: "Documents are not commissioned for this institution." }, { status: 403, ...RESPONSE_INIT });

  const userClient = await createClient();
  const { data, error } = await userClient.rpc("authorize_clean_document_access", {
    p_access_kind: "download",
    p_document_id: documentId,
    p_idempotency_key: input.idempotencyKey,
    p_organization_id: context.activeOrganization.organizationId,
    p_reason: input.reason,
    p_requested_ttl_seconds: DOCUMENT_DOWNLOAD_TTL_SECONDS,
  });
  const authorization = error ? null : parseDocumentAuthorization(data);
  if (!authorization)
    return Response.json({ error: "Document access was not authorized." }, { status: 403, ...RESPONSE_INIT });

  const signedTtlSeconds = remainingAuthorizationSeconds(authorization.expiresAt);
  if (signedTtlSeconds < 1)
    return Response.json({ error: "Document authorization expired." }, { status: 409, ...RESPONSE_INIT });

  let adminClient: ReturnType<typeof createAdminClient>;
  try {
    adminClient = createAdminClient();
  } catch {
    return Response.json({ error: "Document service is unavailable." }, { status: 503, ...RESPONSE_INIT });
  }
  const { data: signedData, error: signedError } = await adminClient.storage
    .from(authorization.bucket)
    .createSignedUrl(authorization.path, signedTtlSeconds);
  if (signedError || !signedData?.signedUrl)
    return Response.json({ error: "Document service is unavailable." }, { status: 502, ...RESPONSE_INIT });

  const { error: auditError } = await adminClient.rpc("record_document_download_issued", {
    p_authorization_id: authorization.authorizationId,
    p_signed_ttl_seconds: signedTtlSeconds,
  });
  if (auditError)
    return Response.json({ error: "Document service is unavailable." }, { status: 502, ...RESPONSE_INIT });

  return Response.json(
    {
      documentId: authorization.documentId,
      expiresAt: authorization.expiresAt,
      sha256: authorization.sha256,
      signedUrl: signedData.signedUrl,
    },
    RESPONSE_INIT,
  );
}
