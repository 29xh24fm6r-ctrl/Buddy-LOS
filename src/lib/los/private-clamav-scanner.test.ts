import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const serviceRoot = join(process.cwd(), "services", "document-scanner");
const server = readFileSync(join(serviceRoot, "server.mjs"), "utf8");
const dockerfile = readFileSync(join(serviceRoot, "Dockerfile"), "utf8");
const entrypoint = readFileSync(join(serviceRoot, "entrypoint.sh"), "utf8");

describe("private ClamAV scanner service contract", () => {
  it("ships disabled and runs the malware engine without root privileges", () => {
    expect(dockerfile).toMatch(/\bSCANNER_ENABLED=false\b/);
    expect(dockerfile).toContain("USER clamav");
    expect(dockerfile).toContain("freshclam");
    expect(entrypoint).toContain("clamd");
  });

  it("enforces bounded authenticated evidence and signed callbacks", () => {
    expect(server).toContain("timingSafeEqual");
    expect(server).toContain('"26214400"');
    expect(server).toContain('createHash("sha256")');
    expect(server).toContain('createHmac("sha256"');
    expect(server).toContain('redirect: "error"');
    expect(server).toContain('exec("clamdscan"');
    expect(server).toContain("SCANNER_CALLBACK_ORIGIN");
    expect(server).toContain("allowedMimeTypes.has(mimeType)");
    expect(server).toContain("{ runId, result: outcome.result }");
    expect(server).not.toContain("{ runId, detail:");
    expect(server).not.toContain("console.log");
  });
});
