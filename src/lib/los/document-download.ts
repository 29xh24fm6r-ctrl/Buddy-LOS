const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

export const DOCUMENT_DOWNLOAD_TTL_SECONDS = 60;

export type DocumentDownloadRequest = { idempotencyKey: string; reason: string };
export type DocumentAuthorization = {
  authorizationId: number;
  bucket: string;
  documentId: string;
  expiresAt: string;
  path: string;
  sha256: string;
};

export function parseDocumentDownloadRequest(value: unknown): DocumentDownloadRequest | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) return null;
  if (reason.length < 3 || reason.length > 500) return null;
  return { idempotencyKey, reason };
}

export function parseDocumentAuthorization(value: unknown): DocumentAuthorization | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!Number.isSafeInteger(input.authorizationId) || Number(input.authorizationId) <= 0) return null;
  if (input.bucket !== "loan-documents" || typeof input.path !== "string" || input.path.length === 0) return null;
  if (typeof input.documentId !== "string" || !UUID.test(input.documentId)) return null;
  if (typeof input.sha256 !== "string" || !SHA256.test(input.sha256)) return null;
  if (typeof input.expiresAt !== "string" || !Number.isFinite(Date.parse(input.expiresAt))) return null;
  return input as DocumentAuthorization;
}

export function remainingAuthorizationSeconds(expiresAt: string, now = Date.now()): number {
  const remaining = Math.floor((Date.parse(expiresAt) - now) / 1000);
  return Math.max(0, Math.min(DOCUMENT_DOWNLOAD_TTL_SECONDS, remaining));
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
