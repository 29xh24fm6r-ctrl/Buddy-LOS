import { createHmac, timingSafeEqual } from "node:crypto";
import { isUuid } from "./document-upload";

const SHA256 = /^[0-9a-f]{64}$/;
const SIGNATURE = /^sha256=([0-9a-f]{64})$/;
const MAX_CLOCK_SKEW_SECONDS = 300;

export type DocumentScanCallback = {
  organizationId: string;
  documentId: string;
  provider: string;
  runId: string;
  result: "clean" | "rejected";
  sha256: string;
  engineVersion: string | null;
  signatureVersion: string | null;
  detail: Record<string, unknown>;
};

export function verifyScannerSignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const timestamp = Number(timestampHeader);
  const signature = signatureHeader?.match(SIGNATURE)?.[1];
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS || !signature || secret.length < 32)
    return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function parseDocumentScanCallback(value: unknown): DocumentScanCallback | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const provider = typeof input.provider === "string" ? input.provider.trim() : "";
  const runId = typeof input.runId === "string" ? input.runId.trim() : "";
  const engineVersion = optionalText(input.engineVersion, 120);
  const signatureVersion = optionalText(input.signatureVersion, 120);
  const detail = input.detail === undefined ? {} : input.detail;
  if (
    typeof input.organizationId !== "string" || !isUuid(input.organizationId) ||
    typeof input.documentId !== "string" || !isUuid(input.documentId) ||
    provider.length < 2 || provider.length > 120 || runId.length < 2 || runId.length > 200 ||
    (input.result !== "clean" && input.result !== "rejected") ||
    typeof input.sha256 !== "string" || !SHA256.test(input.sha256) ||
    engineVersion === undefined || signatureVersion === undefined ||
    !detail || typeof detail !== "object" || Array.isArray(detail)
  ) return null;
  return { organizationId: input.organizationId, documentId: input.documentId, provider, runId, result: input.result, sha256: input.sha256, engineVersion, signatureVersion, detail: detail as Record<string, unknown> };
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : undefined;
}
