import { GoogleAuth } from "google-auth-library";

const RUN_ID_LIMIT = 200;
const RESPONSE_LIMIT = 4096;
const SUBMISSION_TIMEOUT_MS = 20_000;

type ServiceAccountCredentials = { client_email: string; private_key: string; project_id?: string };
type IdentityTokenProvider = (credentials: ServiceAccountCredentials, audience: string) => Promise<string>;
export type ScanSubmissionConfig = { endpoint: string; apiKey: string; provider: string; callbackUrl: string; googleServiceAccount: ServiceAccountCredentials | null };
export class ScanSubmissionError extends Error { constructor(message: string, readonly retryable: boolean) { super(message); } }

export function parseScanSubmissionConfig(env: Record<string, string | undefined>): ScanSubmissionConfig | null {
  const endpoint = secureUrl(env.BUDDY_DOCUMENT_SCANNER_ENDPOINT);
  const callbackUrl = secureUrl(env.BUDDY_DOCUMENT_SCANNER_CALLBACK_URL);
  const apiKey = env.BUDDY_DOCUMENT_SCANNER_API_KEY?.trim() ?? "";
  const provider = env.BUDDY_DOCUMENT_SCANNER_PROVIDER?.trim() ?? "";
  const googleServiceAccount = parseServiceAccount(env.BUDDY_DOCUMENT_SCANNER_GOOGLE_SERVICE_ACCOUNT_JSON);
  if (env.BUDDY_DOCUMENT_SCANNER_GOOGLE_SERVICE_ACCOUNT_JSON?.trim() && !googleServiceAccount) return null;
  if (endpoint && new URL(endpoint).hostname.endsWith(".run.app") && !googleServiceAccount) return null;
  return endpoint && callbackUrl && apiKey.length >= 16 && provider.length >= 2 && provider.length <= 120 ? { endpoint, callbackUrl, apiKey, provider, googleServiceAccount } : null;
}

export async function submitDocumentScan(
  config: ScanSubmissionConfig,
  input: { jobId: string; organizationId: string; documentId: string; sha256: string; mimeType: string; blob: Blob },
  fetchImpl: typeof fetch = fetch,
  identityTokenProvider: IdentityTokenProvider = googleIdentityToken,
) {
  const form = new FormData();
  form.set("file", input.blob, `${input.documentId}.document`);
  form.set("contractVersion", "buddy-document-scan-v1");
  form.set("provider", config.provider);
  form.set("organizationId", input.organizationId);
  form.set("documentId", input.documentId);
  form.set("sha256", input.sha256);
  form.set("mimeType", input.mimeType);
  form.set("callbackUrl", config.callbackUrl);
  form.set("callbackAuthentication", "hmac-sha256-v1");
  const headers: Record<string, string> = { Authorization: `Bearer ${config.apiKey}`, "Idempotency-Key": input.jobId, Accept: "application/json" };
  if (config.googleServiceAccount)
    headers["X-Serverless-Authorization"] = `Bearer ${await identityTokenProvider(config.googleServiceAccount, new URL(config.endpoint).origin)}`;
  const response = await fetchImpl(config.endpoint, {
    method: "POST",
    headers,
    body: form,
    signal: AbortSignal.timeout(SUBMISSION_TIMEOUT_MS),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new ScanSubmissionError(`Scanner submission returned HTTP ${response.status}.`, response.status === 408 || response.status === 429 || response.status >= 500);
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new ScanSubmissionError("Scanner returned an unsupported response type.", false);
  const raw = await response.text();
  if (raw.length > RESPONSE_LIMIT) throw new ScanSubmissionError("Scanner response exceeded the allowed size.", false);
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new ScanSubmissionError("Scanner returned invalid JSON.", false); }
  const runId = value && typeof value === "object" && typeof (value as Record<string, unknown>).runId === "string" ? (value as Record<string, string>).runId.trim() : "";
  if (runId.length < 2 || runId.length > RUN_ID_LIMIT) throw new ScanSubmissionError("Scanner did not return a valid run identity.", false);
  return { runId };
}

function secureUrl(value: string | undefined) { try { const url = new URL(value ?? ""); return url.protocol === "https:" ? url.toString() : null; } catch { return null; } }
async function googleIdentityToken(credentials: ServiceAccountCredentials, audience: string) {
  const client = await new GoogleAuth({ credentials }).getIdTokenClient(audience);
  const headers = await client.getRequestHeaders();
  const authorization = headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new ScanSubmissionError("Private scanner identity token is unavailable.", true);
  return authorization.slice(7);
}
function parseServiceAccount(value: string | undefined): ServiceAccountCredentials | null {
  if (!value?.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ServiceAccountCredentials>;
    return typeof parsed.client_email === "string" && parsed.client_email.includes("@") && typeof parsed.private_key === "string" && parsed.private_key.includes("BEGIN PRIVATE KEY")
      ? { client_email: parsed.client_email, private_key: parsed.private_key, ...(typeof parsed.project_id === "string" ? { project_id: parsed.project_id } : {}) }
      : null;
  } catch { return null; }
}
