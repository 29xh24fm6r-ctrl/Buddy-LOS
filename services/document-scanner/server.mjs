import { createServer } from "node:http";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const maxBytes = Number(process.env.MAX_FILE_BYTES ?? "26214400");
const provider = process.env.SCANNER_PROVIDER ?? "buddy-private-clamav";
const enabled = process.env.SCANNER_ENABLED === "true";
const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const callbackOrigin = secureOrigin(process.env.SCANNER_CALLBACK_ORIGIN);
const ready = enabled
  && (process.env.SCANNER_API_KEY?.length ?? 0) >= 16
  && (process.env.SCANNER_WEBHOOK_SECRET?.length ?? 0) >= 32
  && callbackOrigin !== null;

function secretMatches(header) {
  const expected = Buffer.from(`Bearer ${process.env.SCANNER_API_KEY ?? ""}`);
  const actual = Buffer.from(header ?? "");
  return expected.length >= 23 && expected.length === actual.length && timingSafeEqual(expected, actual);
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

async function callbackWithRetry(callbackUrl, payload) {
  const raw = JSON.stringify(payload);
  for (const delay of [250, 1000, 3000, 10_000]) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", process.env.SCANNER_WEBHOOK_SECRET ?? "").update(`${timestamp}.${raw}`).digest("hex");
    try {
      const response = await fetch(callbackUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "x-buddy-scanner-timestamp": timestamp, "x-buddy-scanner-signature": `sha256=${signature}` },
        body: raw,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) return;
    } catch { /* bounded retry; document content is never logged */ }
  }
}

async function scan(file) {
  const directory = await mkdtemp(join(tmpdir(), "buddy-scan-"));
  const path = join(directory, "document");
  try {
    await writeFile(path, new Uint8Array(await file.arrayBuffer()), { mode: 0o600 });
    try {
      const { stdout } = await exec("clamdscan", ["--fdpass", "--no-summary", path], { timeout: 15_000, maxBuffer: 16_384 });
      return { result: "clean", detail: { signature: null, output: stdout.trim().slice(0, 200) } };
    } catch (error) {
      if (error && typeof error === "object" && error.code === 1)
        return { result: "rejected", detail: { signature: String(error.stdout ?? "malware-detected").trim().slice(0, 200) } };
      throw error;
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function createScannerServer() {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") return json(response, 200, { ready, provider });
    if (request.method !== "POST" || request.url !== "/v1/scan") return json(response, 404, { error: "not_found" });
    if (!ready) return json(response, 503, { error: "scanner_disabled" });
    if (!secretMatches(request.headers.authorization)) return json(response, 401, { error: "unauthorized" });
    const contentLength = Number(request.headers["content-length"] ?? 0);
    if (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > maxBytes + 65_536)
      return json(response, 413, { error: "payload_too_large" });
    try {
      const origin = `http://${request.headers.host ?? "localhost"}`;
      const webRequest = new Request(new URL(request.url, origin), { method: "POST", headers: request.headers, body: request, duplex: "half" });
      const form = await webRequest.formData();
      const file = form.get("file");
      const jobId = request.headers["idempotency-key"];
      const organizationId = String(form.get("organizationId") ?? "");
      const documentId = String(form.get("documentId") ?? "");
      const sha256 = String(form.get("sha256") ?? "");
      const mimeType = String(form.get("mimeType") ?? "");
      const callbackUrl = String(form.get("callbackUrl") ?? "");
      const validCallback = secureOrigin(callbackUrl) === callbackOrigin && !new URL(callbackUrl).username && !new URL(callbackUrl).password;
      const valid = file instanceof File && file.size >= 1 && file.size <= maxBytes && typeof jobId === "string" && validCallback && allowedMimeTypes.has(mimeType)
        && form.get("contractVersion") === "buddy-document-scan-v1" && form.get("provider") === provider && form.get("callbackAuthentication") === "hmac-sha256-v1";
      if (!valid) return json(response, 400, { error: "invalid_request" });
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (createHash("sha256").update(bytes).digest("hex") !== sha256 || file.type !== mimeType)
        return json(response, 409, { error: "document_evidence_mismatch" });
      const outcome = await scan(new File([bytes], "document", { type: mimeType }));
      const runId = `clamav-${jobId}`.slice(0, 200);
      json(response, 202, { runId });
      void callbackWithRetry(callbackUrl, { organizationId, documentId, provider, runId, result: outcome.result, sha256, engineVersion: "clamav-1", signatureVersion: "hmac-sha256-v1", detail: outcome.detail });
    } catch {
      if (!response.headersSent) return json(response, 500, { error: "scan_failed" });
    }
  });
}

function secureOrigin(value) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

if (process.env.NODE_ENV !== "test") createScannerServer().listen(Number(process.env.PORT ?? "8080"), "0.0.0.0");
