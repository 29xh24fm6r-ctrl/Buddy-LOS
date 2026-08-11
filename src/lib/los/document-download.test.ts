import { describe, expect, it } from "vitest";
import {
  parseDocumentAuthorization,
  parseDocumentDownloadRequest,
  remainingAuthorizationSeconds,
} from "./document-download";

describe("document download exchange", () => {
  it("accepts only bounded reasons and idempotency keys", () => {
    expect(parseDocumentDownloadRequest({ idempotencyKey: "request-123", reason: "Credit review" })).toEqual({
      idempotencyKey: "request-123",
      reason: "Credit review",
    });
    expect(parseDocumentDownloadRequest({ idempotencyKey: "short", reason: "Credit review" })).toBeNull();
    expect(parseDocumentDownloadRequest({ idempotencyKey: "request-123", reason: "x" })).toBeNull();
  });

  it("accepts only the private loan bucket and verified response shape", () => {
    const valid = {
      authorizationId: 12,
      bucket: "loan-documents",
      documentId: "11111111-1111-4111-8111-111111111111",
      expiresAt: "2026-08-11T22:00:00.000Z",
      path: "org/deal/document.pdf",
      sha256: "a".repeat(64),
    };
    expect(parseDocumentAuthorization(valid)).toEqual(valid);
    expect(parseDocumentAuthorization({ ...valid, bucket: "public" })).toBeNull();
    expect(parseDocumentAuthorization({ ...valid, sha256: "unverified" })).toBeNull();
  });

  it("never signs beyond the remaining authorization window", () => {
    const now = Date.parse("2026-08-11T21:59:00.000Z");
    expect(remainingAuthorizationSeconds("2026-08-11T22:00:30.000Z", now)).toBe(60);
    expect(remainingAuthorizationSeconds("2026-08-11T21:59:20.000Z", now)).toBe(20);
    expect(remainingAuthorizationSeconds("2026-08-11T21:58:59.000Z", now)).toBe(0);
  });
});
