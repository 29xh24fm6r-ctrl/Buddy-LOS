export type UploadPreparation = { documentId: string; bucket: "loan-documents"; path: string; token: string };
export type UploadOutcome = { documentId: string; securityStatus: "quarantined"; sha256: string };
export type UploadClientDeps = {
  prepare: () => Promise<UploadPreparation>;
  upload: (preparation: UploadPreparation) => Promise<void>;
  finalize: (documentId: string) => Promise<UploadOutcome>;
};

export async function uploadDocumentToQuarantine(deps: UploadClientDeps): Promise<UploadOutcome> {
  const preparation = await deps.prepare();
  await deps.upload(preparation);
  const outcome = await deps.finalize(preparation.documentId);
  if (outcome.documentId !== preparation.documentId || outcome.securityStatus !== "quarantined")
    throw new Error("The uploaded document did not enter quarantine.");
  return outcome;
}

export function parseUploadPreparation(value: unknown): UploadPreparation | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.documentId !== "string" || input.bucket !== "loan-documents" || typeof input.path !== "string" || typeof input.token !== "string") return null;
  if (!input.path || !input.token) return null;
  return input as UploadPreparation;
}

export function parseUploadOutcome(value: unknown): UploadOutcome | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.documentId !== "string" || input.securityStatus !== "quarantined" || typeof input.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(input.sha256)) return null;
  return input as UploadOutcome;
}
