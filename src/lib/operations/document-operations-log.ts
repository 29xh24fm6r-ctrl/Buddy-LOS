const SAFE_OUTCOMES = new Set([
  "disabled", "unauthorized", "unconfigured", "unavailable", "empty", "completed",
  "failed", "retryable", "restored", "awaiting_result", "health_reported",
]);

export type DocumentOperation = "scan_submit" | "cleanup" | "health";

export function logDocumentOperation(input: {
  operation: DocumentOperation;
  outcome: string;
  requestId?: string | null;
  durationMs: number;
  level?: "info" | "warn" | "error";
}) {
  const payload = {
    level: input.level ?? "info",
    message: "document_operation",
    operation: input.operation,
    outcome: SAFE_OUTCOMES.has(input.outcome) ? input.outcome : "failed",
    requestId: boundedRequestId(input.requestId),
    durationMs: Math.max(0, Math.round(input.durationMs)),
  };
  const serialized = JSON.stringify(payload);
  if (payload.level === "error") console.error(serialized);
  else if (payload.level === "warn") console.warn(serialized);
  else console.info(serialized);
  return payload;
}

function boundedRequestId(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized && normalized.length <= 160 ? normalized : null;
}
