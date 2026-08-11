import { describe, expect, it } from "vitest";
import { readFoundationStatus } from "./foundation-status";

describe("readFoundationStatus", () => {
  it("fails closed when configuration is absent", () => {
    expect(readFoundationStatus({})).toEqual({
      supabaseConfigured: false,
      authEnabled: false,
      readsEnabled: false,
      writesEnabled: false,
      documentsEnabled: false,
      integrationsEnabled: false,
    });
  });

  it("does not enable Supabase capabilities without public configuration", () => {
    expect(readFoundationStatus({ NEXT_PUBLIC_BUDDY_WRITES_ENABLED: "true" })).toMatchObject({
      supabaseConfigured: false,
      writesEnabled: false,
    });
  });

  it("enables only explicitly configured capabilities", () => {
    expect(readFoundationStatus({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      NEXT_PUBLIC_BUDDY_AUTH_ENABLED: "true",
    })).toMatchObject({ supabaseConfigured: true, authEnabled: true, writesEnabled: false });
  });
});
