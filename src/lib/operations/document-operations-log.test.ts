import { describe, expect, it, vi } from "vitest";
import { logDocumentOperation } from "./document-operations-log";

describe("document operations structured logging", () => {
  it("emits only the bounded operational allowlist", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const payload = logDocumentOperation({ operation: "scan_submit", outcome: "completed", requestId: "iad1::request", durationMs: 12.6 });
    expect(payload).toEqual({ level: "info", message: "document_operation", operation: "scan_submit", outcome: "completed", requestId: "iad1::request", durationMs: 13 });
    expect(info).toHaveBeenCalledWith(JSON.stringify(payload));
    info.mockRestore();
  });

  it("does not echo arbitrary errors or oversized request identifiers", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const payload = logDocumentOperation({ operation: "cleanup", outcome: "borrower name and storage path", requestId: "x".repeat(161), durationMs: -1, level: "error" });
    expect(payload).toMatchObject({ outcome: "failed", requestId: null, durationMs: 0 });
    expect(JSON.stringify(payload)).not.toContain("borrower name");
    error.mockRestore();
  });
});
