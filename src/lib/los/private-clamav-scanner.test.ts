import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const serviceRoot = join(process.cwd(), "services", "document-scanner");
const server = readFileSync(join(serviceRoot, "server.mjs"), "utf8");
const dockerfile = readFileSync(join(serviceRoot, "Dockerfile"), "utf8");

describe("private ClamAV scanner service contract", () => {
  it("ships disabled and runs the malware engine without root privileges", () => {
    expect(dockerfile).toMatch(/\bSCANNER_ENABLED=false\b/);
    expect(dockerfile).toContain("USER clamav");
    expect(dockerfile).toContain("clamav/clamav:1.4-debian13-slim AS clamav-signatures");
    expect(dockerfile).toContain("COPY --from=clamav-signatures");
    expect(dockerfile).not.toMatch(/RUN[\s\S]*?freshclam/);
    expect(dockerfile).toContain("--chown=clamav:clamav --chmod=0444");
    expect(dockerfile).toContain('CMD ["node", "/app/server.mjs"]');
  });

  it("enforces bounded authenticated evidence and signed callbacks", () => {
    expect(server).toContain("timingSafeEqual");
    expect(server).toContain('"26214400"');
    expect(server).toContain('createHash("sha256")');
    expect(server).toContain('createHmac("sha256"');
    expect(server).toContain('redirect: "error"');
    expect(server).toContain('exec("clamscan"');
    expect(server).toContain("SCANNER_CALLBACK_ORIGIN");
    expect(server).toContain("allowedMimeTypes.has(mimeType)");
    expect(server).toContain("{ runId, result: outcome.result }");
    expect(server).not.toContain("{ runId, detail:");
    expect(server).not.toContain("console.log");
  });
});
