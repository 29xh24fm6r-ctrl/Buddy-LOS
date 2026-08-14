import { describe, expect, it, vi } from "vitest";
import { parseScanSubmissionConfig, ScanSubmissionError, submitDocumentScan } from "./document-scan-submission";

describe("document scan submission configuration", () => {
  const valid = { BUDDY_DOCUMENT_SCANNER_ENDPOINT: "https://scanner.example/submit", BUDDY_DOCUMENT_SCANNER_CALLBACK_URL: "https://buddy.example/api/internal/document-scans/callback", BUDDY_DOCUMENT_SCANNER_API_KEY: "scanner-api-key-long-enough", BUDDY_DOCUMENT_SCANNER_PROVIDER: "example-scanner" };
  it("accepts complete HTTPS-only server configuration", () => expect(parseScanSubmissionConfig(valid)).toEqual({ endpoint: "https://scanner.example/submit", callbackUrl: "https://buddy.example/api/internal/document-scans/callback", apiKey: "scanner-api-key-long-enough", provider: "example-scanner", googleServiceAccount: null }));
  it("requires Google identity for private Cloud Run", () => {
    const privateEnv = { ...valid, BUDDY_DOCUMENT_SCANNER_ENDPOINT: "https://buddy-scanner.us-west1.run.app/v1/scan" };
    expect(parseScanSubmissionConfig(privateEnv)).toBeNull();
    expect(parseScanSubmissionConfig({ ...privateEnv, BUDDY_DOCUMENT_SCANNER_GOOGLE_SERVICE_ACCOUNT_JSON: "not-json" })).toBeNull();
  });
  it("rejects insecure, incomplete, and short-secret configurations", () => {
    expect(parseScanSubmissionConfig({ ...valid, BUDDY_DOCUMENT_SCANNER_ENDPOINT: "http://scanner.example" })).toBeNull();
    expect(parseScanSubmissionConfig({ ...valid, BUDDY_DOCUMENT_SCANNER_API_KEY: "short" })).toBeNull();
    expect(parseScanSubmissionConfig({ ...valid, BUDDY_DOCUMENT_SCANNER_PROVIDER: "" })).toBeNull();
  });
});

describe("provider-neutral document scan contract", () => {
  const config = {
    endpoint: "https://scanner.example/submit",
    callbackUrl: "https://buddy.example/api/internal/document-scans/callback",
    apiKey: "scanner-api-key-long-enough",
    provider: "approved-scanner",
    googleServiceAccount: null,
  };
  const input = {
    jobId: "9f17738e-4cba-4106-b235-89ed62145bda",
    organizationId: "f9a9b61f-c459-4f66-886f-b5017ac87cab",
    documentId: "55eb8df7-35a5-43fc-8325-a7904d24c932",
    sha256: "a".repeat(64),
    mimeType: "application/pdf",
    blob: new Blob(["private-loan-document"], { type: "application/pdf" }),
  };

  it("sends the versioned authenticated multipart contract without redirecting", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("error");
      expect(init?.cache).toBe("no-store");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${config.apiKey}`);
      expect(new Headers(init?.headers).get("idempotency-key")).toBe(input.jobId);
      const body = init?.body as FormData;
      expect(body.get("contractVersion")).toBe("buddy-document-scan-v1");
      expect(body.get("provider")).toBe(config.provider);
      expect(body.get("organizationId")).toBe(input.organizationId);
      expect(body.get("documentId")).toBe(input.documentId);
      expect(body.get("sha256")).toBe(input.sha256);
      expect(body.get("mimeType")).toBe(input.mimeType);
      expect(body.get("callbackUrl")).toBe(config.callbackUrl);
      expect(body.get("callbackAuthentication")).toBe("hmac-sha256-v1");
      const file = body.get("file") as File;
      expect(file.name).toBe(`${input.documentId}.document`);
      expect(file.type).toBe(input.mimeType);
      return Response.json({ runId: "provider-run-123" });
    });

    await expect(submitDocumentScan(config, input, fetchImpl as typeof fetch)).resolves.toEqual({ runId: "provider-run-123" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("sends private Cloud Run identity separately from the scanner API key", async () => {
    const privateConfig = {
      ...config,
      endpoint: "https://buddy-scanner.us-west1.run.app/v1/scan",
      googleServiceAccount: {
        client_email: "los-invoker@example.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
      },
    };
    const identity = vi.fn(async (_credentials: unknown, audience: string) => {
      expect(audience).toBe("https://buddy-scanner.us-west1.run.app");
      return "google-identity-token";
    });
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe(`Bearer ${config.apiKey}`);
      expect(headers.get("x-serverless-authorization")).toBe("Bearer google-identity-token");
      return Response.json({ runId: "private-clamav-run-123" });
    });

    await expect(submitDocumentScan(privateConfig, input, fetchImpl as typeof fetch, identity)).resolves.toEqual({ runId: "private-clamav-run-123" });
    expect(identity).toHaveBeenCalledOnce();
  });

  it.each([
    [408, true],
    [429, true],
    [503, true],
    [400, false],
    [401, false],
  ])("classifies HTTP %i retryability without exposing response bodies", async (status, retryable) => {
    const fetchImpl = vi.fn(async () => new Response("provider secret detail", { status }));
    const failure = await submitDocumentScan(config, input, fetchImpl as typeof fetch).catch((caught) => caught);
    expect(failure).toBeInstanceOf(ScanSubmissionError);
    expect(failure).toMatchObject({ retryable });
    expect((failure as Error).message).not.toContain("provider secret detail");
  });

  it("rejects non-JSON and oversized success responses", async () => {
    await expect(submitDocumentScan(config, input, vi.fn(async () => new Response("ok")) as typeof fetch))
      .rejects.toEqual(expect.objectContaining<Partial<ScanSubmissionError>>({ retryable: false }));
    await expect(submitDocumentScan(config, input, vi.fn(async () => Response.json({ runId: "x".repeat(4097) })) as typeof fetch))
      .rejects.toEqual(expect.objectContaining<Partial<ScanSubmissionError>>({ retryable: false }));
  });
});
