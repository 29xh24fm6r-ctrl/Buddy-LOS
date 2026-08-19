import { GoogleAuth } from "google-auth-library";

const RUN_ID_LIMIT = 200;
const RESPONSE_LIMIT = 4096;
const SUBMISSION_TIMEOUT_MS = 20_000;
const PREFLIGHT_TIMEOUT_MS = 10_000;

type ServiceAccountCredentials = { client_email: string; private_key: string; project_id?: string };
export type IdentityTokenProvider = (credentials: ServiceAccountCredentials, audience: string) => Promise<string>;
export type ScanSubmissionConfig = { endpoint: string; audience: string | null; apiKey: string; provider: string; callbackUrl: string; googleServiceAccount: ServiceAccountCredentials | null };
export type ScanSubmissionErrorCode = "scanner_submission_failed" | "cloud_run_identity_unavailable" | "cloud_run_identity_rejected" | "cloud_run_invocation_forbidden" | "scanner_preflight_unavailable";
export class ScanSubmissionError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly consumesAttempt = true, readonly code: ScanSubmissionErrorCode = "scanner_submission_failed") { super(message); }
}

export async function preflightDocumentScanner(
  config: ScanSubmissionConfig,
  fetchImpl: typeof fetch = fetch,
  identityTokenProvider: IdentityTokenProvider = googleIdentityToken,
) {
  if (!config.googleServiceAccount || !config.audience) return { ready: true as const, mode: "api_key" as const };
  const identityToken = await resolveIdentityToken(config, identityTokenProvider);
  let response: Response;
  try {
    response = await fetchImpl(`${config.audience}/health`, {
      method: "GET",
      headers: { Authorization: `Bearer ${identityToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new ScanSubmissionError("Private scanner preflight is unavailable.", true, false, "scanner_preflight_unavailable");
  }
  if (response.status === 401) throw new ScanSubmissionError("Cloud Run scanner identity authentication was rejected.", true, false, "cloud_run_identity_rejected");
  if (response.status === 403) throw new ScanSubmissionError("Cloud Run scanner invocation authorization was rejected.", true, false, "cloud_run_invocation_forbidden");
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new ScanSubmissionError("Private scanner preflight is unavailable.", true, false, "scanner_preflight_unavailable");
  let payload: unknown;
  try { payload = JSON.parse(await response.text()); } catch { payload = null; }
  if (!payload || typeof payload !== "object" || (payload as { ready?: unknown }).ready !== true)
    throw new ScanSubmissionError("Private scanner preflight is unavailable.", true, false, "scanner_preflight_unavailable");
  return { ready: true as const, mode: "cloud_run" as const };
}

export function parseScanSubmissionConfig(env: Record<string, string | undefined>): ScanSubmissionConfig | null {
  const configuredEndpoint = secureUrl(env.BUDDY_DOCUMENT_SCANNER_ENDPOINT);
  const configuredAudience = secureOrigin(env.BUDDY_DOCUMENT_SCANNER_AUDIENCE);
  const serviceUrl = secureOrigin(env.BUDDY_DOCUMENT_SCANNER_SERVICE_URL);
  const callbackUrl = secureUrl(env.BUDDY_DOCUMENT_SCANNER_CALLBACK_URL);
  const apiKey = env.BUDDY_DOCUMENT_SCANNER_API_KEY?.trim() ?? "";
  const provider = env.BUDDY_DOCUMENT_SCANNER_PROVIDER?.trim() ?? "";
  const googleServiceAccount = parseServiceAccount(env.BUDDY_DOCUMENT_SCANNER_GOOGLE_SERVICE_ACCOUNT_JSON);
  if (env.BUDDY_DOCUMENT_SCANNER_GOOGLE_SERVICE_ACCOUNT_JSON?.trim() && !googleServiceAccount) return null;
  if (env.BUDDY_DOCUMENT_SCANNER_AUDIENCE?.trim() && !configuredAudience) return null;
  if (env.BUDDY_DOCUMENT_SCANNER_SERVICE_URL?.trim() && !serviceUrl) return null;
  const endpointIsCloudRun = configuredEndpoint ? new URL(configuredEndpoint).hostname.endsWith(".run.app") : false;
  const privateScannerConfigured = Boolean(endpointIsCloudRun || configuredAudience || serviceUrl || googleServiceAccount);
  let endpoint = configuredEndpoint;
  let audience = configuredAudience;
  if (privateScannerConfigured) {
    const canonicalOrigin = serviceUrl ?? configuredAudience;
    if (!configuredEndpoint || !endpointIsCloudRun || !googleServiceAccount || !canonicalOrigin
      || !new URL(canonicalOrigin).hostname.endsWith(".run.app")
      || (serviceUrl && configuredAudience && serviceUrl !== configuredAudience)) return null;
    // Cloud Run validates the token audience against the receiving service.
    // Derive both values from one canonical origin so aliases cannot diverge.
    endpoint = `${canonicalOrigin}/v1/scan`;
    audience = canonicalOrigin;
  }
  return endpoint && callbackUrl && apiKey.length >= 16 && provider.length >= 2 && provider.length <= 120 ? { endpoint, audience, callbackUrl, apiKey, provider, googleServiceAccount } : null;
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
  if (config.googleServiceAccount && config.audience) {
    const identityToken = await resolveIdentityToken(config, identityTokenProvider);
    headers["X-Serverless-Authorization"] = `Bearer ${identityToken}`;
  }
  const response = await fetchImpl(config.endpoint, {
    method: "POST",
    headers,
    body: form,
    signal: AbortSignal.timeout(SUBMISSION_TIMEOUT_MS),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) {
    const identityFailure = (response.status === 401 || response.status === 403) && isGoogleFrontEnd(response);
    throw new ScanSubmissionError(
      responseFailureMessage(response),
      identityFailure || response.status === 408 || response.status === 429 || response.status >= 500,
      !identityFailure,
    );
  }
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new ScanSubmissionError("Scanner returned an unsupported response type.", false);
  const raw = await response.text();
  if (raw.length > RESPONSE_LIMIT) throw new ScanSubmissionError("Scanner response exceeded the allowed size.", false);
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new ScanSubmissionError("Scanner returned invalid JSON.", false); }
  const runId = value && typeof value === "object" && typeof (value as Record<string, unknown>).runId === "string" ? (value as Record<string, string>).runId.trim() : "";
  if (runId.length < 2 || runId.length > RUN_ID_LIMIT) throw new ScanSubmissionError("Scanner did not return a valid run identity.", false);
  return { runId };
}

async function resolveIdentityToken(config: ScanSubmissionConfig, identityTokenProvider: IdentityTokenProvider) {
  if (!config.googleServiceAccount || !config.audience)
    throw new ScanSubmissionError("Private scanner identity configuration is unavailable.", true, false, "cloud_run_identity_unavailable");
  let identityToken: string;
  try { identityToken = await identityTokenProvider(config.googleServiceAccount, config.audience); }
  catch { throw new ScanSubmissionError("Private scanner identity token could not be created.", true, false, "cloud_run_identity_unavailable"); }
  assertIdentityToken(identityToken, config.audience);
  return identityToken;
}

function secureUrl(value: string | undefined) { try { const url = new URL(value ?? ""); return url.protocol === "https:" ? url.toString() : null; } catch { return null; } }
function secureOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password
      ? url.origin
      : null;
  } catch { return null; }
}
function responseFailureMessage(response: Response) {
  if (response.status === 401 && isGoogleFrontEnd(response)) return "Cloud Run scanner identity authentication was rejected.";
  if (response.status === 403 && isGoogleFrontEnd(response)) return "Cloud Run scanner invocation authorization was rejected.";
  if (response.status === 401) return "Scanner API authentication was rejected.";
  return `Scanner submission returned HTTP ${response.status}.`;
}
function isGoogleFrontEnd(response: Response) {
  return response.headers.get("server")?.toLowerCase().includes("google frontend") === true
    || response.headers.get("www-authenticate")?.toLowerCase().includes("invalid_token") === true;
}
async function googleIdentityToken(credentials: ServiceAccountCredentials, audience: string) {
  const client = await new GoogleAuth({ credentials }).getIdTokenClient(audience);
  const headers = await client.getRequestHeaders();
  const authorization = headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new ScanSubmissionError("Private scanner identity token is unavailable.", true, false);
  return authorization.slice(7);
}
function assertIdentityToken(token: string, audience: string) {
  try {
    const segments = token.split(".");
    if (segments.length !== 3) throw new Error("invalid token structure");
    const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")) as { aud?: unknown; exp?: unknown };
    if (payload.aud !== audience) throw new Error("audience mismatch");
    if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000) + 30) throw new Error("token expired");
  } catch {
    throw new ScanSubmissionError("Private scanner identity token is invalid for the configured service.", true, false, "cloud_run_identity_unavailable");
  }
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
