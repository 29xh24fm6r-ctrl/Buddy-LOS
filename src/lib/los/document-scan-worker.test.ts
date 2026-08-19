import { describe, expect, it, vi } from "vitest";
import { ScanSubmissionError, type ScanSubmissionConfig } from "./document-scan-submission";
import { processDocumentScanJob } from "./document-scan-worker";

describe("document scan worker preflight", () => {
  const config: ScanSubmissionConfig = {
    endpoint: "https://scanner.example.com/v1/scan",
    audience: null,
    apiKey: "scanner-api-key-long-enough",
    provider: "buddy-private-clamav",
    callbackUrl: "https://www.buddylos.com/api/internal/document-scans/callback",
    googleServiceAccount: null,
  };

  it("does not claim or mutate a queued job when scanner preflight fails", async () => {
    const rpc = vi.fn();
    const admin = { rpc } as never;
    const preflight = vi.fn(async () => {
      throw new ScanSubmissionError(
        "Scanner runtime preflight failed.",
        true,
        false,
        "scanner_preflight_unavailable",
      );
    });

    await expect(
      processDocumentScanJob(admin, config, undefined, { preflight }),
    ).rejects.toMatchObject({
      code: "scanner_preflight_unavailable",
      consumesAttempt: false,
    });
    expect(preflight).toHaveBeenCalledWith(config);
    expect(rpc).not.toHaveBeenCalled();
  });
});
