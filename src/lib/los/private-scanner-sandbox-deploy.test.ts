import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = readFileSync(join(process.cwd(), "scripts", "private-scanner-sandbox-deploy.sh"), "utf8");

describe("private scanner sandbox deployment guardrails", () => {
  it("deploys only an authenticated default-off sandbox", () => {
    expect(script).toContain("--no-allow-unauthenticated");
    expect(script).toContain("SCANNER_ENABLED=false");
    expect(script).not.toContain("SCANNER_ENABLED=true");
    expect(script).toContain("--no-cpu-throttling");
    expect(script).toContain("--memory 2Gi");
    expect(script).toContain("roles/run.invoker");
  });

  it("binds an exact clean checkout and keeps secrets in Secret Manager", () => {
    expect(script).toContain("git status --porcelain");
    expect(script).toContain("git rev-parse HEAD");
    expect(script).toContain("gcloud secrets versions add");
    expect(script).toContain("roles/secretmanager.secretAccessor");
    expect(script).not.toContain("service-accounts keys create");
  });
});

