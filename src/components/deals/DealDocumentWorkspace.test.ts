import { describe, expect, it } from "vitest";
import { formatBytes } from "./DealDocumentWorkspace";

describe("deal document workspace", () => {
  it("formats stored file sizes for bankers", () => {
    expect(formatBytes(800)).toBe("800 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("does not invent a size for invalid metadata", () => {
    expect(formatBytes(Number.NaN)).toBe("Unknown size");
    expect(formatBytes(-1)).toBe("Unknown size");
  });
});
