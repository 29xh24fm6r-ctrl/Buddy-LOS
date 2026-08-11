import { describe, expect, it, vi } from "vitest";
import { parseUploadOutcome, parseUploadPreparation, uploadDocumentToQuarantine } from "./document-upload-client";

describe("document upload client", () => {
  it("runs reserve, exact-path upload, then quarantine finalization", async () => {
    const order: string[] = [];
    const outcome = await uploadDocumentToQuarantine({
      prepare: async () => { order.push("prepare"); return { documentId: "doc", bucket: "loan-documents", path: "org/deal/doc", token: "token" }; },
      upload: async () => { order.push("upload"); },
      finalize: async () => { order.push("finalize"); return { documentId: "doc", securityStatus: "quarantined", sha256: "a".repeat(64) }; },
    });
    expect(order).toEqual(["prepare", "upload", "finalize"]);
    expect(outcome.securityStatus).toBe("quarantined");
  });

  it("does not finalize after a failed binary upload", async () => {
    const finalize = vi.fn();
    await expect(uploadDocumentToQuarantine({
      prepare: async () => ({ documentId: "doc", bucket: "loan-documents", path: "path", token: "token" }),
      upload: async () => { throw new Error("upload failed"); },
      finalize,
    })).rejects.toThrow("upload failed");
    expect(finalize).not.toHaveBeenCalled();
  });

  it("rejects malformed server responses", () => {
    expect(parseUploadPreparation({ bucket: "public", path: "x", token: "y", documentId: "z" })).toBeNull();
    expect(parseUploadOutcome({ documentId: "z", securityStatus: "clean", sha256: "a".repeat(64) })).toBeNull();
  });
});
