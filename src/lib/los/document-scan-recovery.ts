import type { OrganizationRole } from "@/lib/auth/access-context";

export type DocumentScanRecoveryInput = { reason: string; idempotencyKey: string };

export function canRecoverDocumentScan(role: OrganizationRole): boolean {
  return role === "owner" || role === "administrator";
}

export function parseDocumentScanRecoveryInput(value: unknown): DocumentScanRecoveryInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.reason !== "string" || typeof input.idempotencyKey !== "string") return null;
  const reason = input.reason.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (reason.length < 3 || reason.length > 500 || idempotencyKey.length < 8 || idempotencyKey.length > 160) return null;
  return { reason, idempotencyKey };
}

export function safeDocumentScanFailure(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes("cloud run scanner identity")) return "Cloud Run scanner identity was rejected.";
  if (normalized.includes("cloud run scanner invocation")) return "Cloud Run scanner invocation was rejected.";
  if (normalized.includes("scanner api authentication")) return "Scanner API authentication was rejected.";
  if (normalized.includes("401") || normalized.includes("unauthorized")) return "Scanner authentication was rejected.";
  if (normalized.includes("timeout")) return "Scanner submission timed out.";
  if (normalized.includes("stored document")) return "Stored document verification failed.";
  return "Scanner submission failed.";
}
