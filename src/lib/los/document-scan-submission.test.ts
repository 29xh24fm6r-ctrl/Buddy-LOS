import { describe, expect, it } from "vitest";
import { parseScanSubmissionConfig } from "./document-scan-submission";

describe("document scan submission configuration", () => {
  const valid = { BUDDY_DOCUMENT_SCANNER_ENDPOINT: "https://scanner.example/submit", BUDDY_DOCUMENT_SCANNER_CALLBACK_URL: "https://buddy.example/api/internal/document-scans/callback", BUDDY_DOCUMENT_SCANNER_API_KEY: "scanner-api-key-long-enough", BUDDY_DOCUMENT_SCANNER_PROVIDER: "example-scanner" };
  it("accepts complete HTTPS-only server configuration", () => expect(parseScanSubmissionConfig(valid)).toEqual({ endpoint: "https://scanner.example/submit", callbackUrl: "https://buddy.example/api/internal/document-scans/callback", apiKey: "scanner-api-key-long-enough", provider: "example-scanner" }));
  it("rejects insecure, incomplete, and short-secret configurations", () => {
    expect(parseScanSubmissionConfig({ ...valid, BUDDY_DOCUMENT_SCANNER_ENDPOINT: "http://scanner.example" })).toBeNull();
    expect(parseScanSubmissionConfig({ ...valid, BUDDY_DOCUMENT_SCANNER_API_KEY: "short" })).toBeNull();
    expect(parseScanSubmissionConfig({ ...valid, BUDDY_DOCUMENT_SCANNER_PROVIDER: "" })).toBeNull();
  });
});
