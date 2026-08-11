import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseDocumentScanCallback, verifyScannerSignature } from "./document-scan-callback";

const secret = "scanner-secret-that-is-at-least-32-characters";
const body = JSON.stringify({ documentId: "550e8400-e29b-41d4-a716-446655440000" });

describe("scanner callback authentication", () => {
  it("accepts an exact, fresh HMAC and rejects tampering or stale delivery", () => {
    const timestamp = 1_800_000_000;
    const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
    expect(verifyScannerSignature(body, String(timestamp), signature, secret, timestamp)).toBe(true);
    expect(verifyScannerSignature(`${body} `, String(timestamp), signature, secret, timestamp)).toBe(false);
    expect(verifyScannerSignature(body, String(timestamp - 301), signature, secret, timestamp)).toBe(false);
  });
});

describe("scanner callback payload", () => {
  const valid = { organizationId: "550e8400-e29b-41d4-a716-446655440000", documentId: "550e8400-e29b-41d4-a716-446655440001", provider: "scanner", runId: "run-1", result: "clean", sha256: "a".repeat(64), engineVersion: "1", signatureVersion: "2", detail: { threats: 0 } };
  it("accepts bounded terminal scan evidence", () => expect(parseDocumentScanCallback(valid)).toEqual(valid));
  it("rejects nonterminal, malformed, or uppercase hash evidence", () => {
    expect(parseDocumentScanCallback({ ...valid, result: "scanning" })).toBeNull();
    expect(parseDocumentScanCallback({ ...valid, organizationId: "other" })).toBeNull();
    expect(parseDocumentScanCallback({ ...valid, sha256: "A".repeat(64) })).toBeNull();
  });
});
