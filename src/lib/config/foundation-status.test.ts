import { describe, expect, it } from "vitest";
import { documentsEnabledForOrganization, readFoundationStatus, writesEnabledForOrganization } from "./foundation-status";

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

  it("limits writes to explicitly allowed organizations", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      NEXT_PUBLIC_BUDDY_WRITES_ENABLED: "true",
      BUDDY_WRITES_ORGANIZATION_IDS: " 9E3F6B9B-7116-41E7-8BE4-A0FF97D4BCD7 ",
    };

    expect(writesEnabledForOrganization("9e3f6b9b-7116-41e7-8be4-a0ff97d4bcd7", env)).toBe(true);
    expect(writesEnabledForOrganization("00000000-0000-4000-8000-000000000099", env)).toBe(false);
    expect(writesEnabledForOrganization("9e3f6b9b-7116-41e7-8be4-a0ff97d4bcd7", {
      ...env,
      NEXT_PUBLIC_BUDDY_WRITES_ENABLED: "false",
    })).toBe(false);
  });

  it("limits documents to explicitly allowed organizations", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      NEXT_PUBLIC_BUDDY_DOCUMENTS_ENABLED: "true",
      BUDDY_DOCUMENTS_ORGANIZATION_IDS: " 9E3F6B9B-7116-41E7-8BE4-A0FF97D4BCD7 ",
    };

    expect(documentsEnabledForOrganization("9e3f6b9b-7116-41e7-8be4-a0ff97d4bcd7", env)).toBe(true);
    expect(documentsEnabledForOrganization("00000000-0000-4000-8000-000000000099", env)).toBe(false);
    expect(documentsEnabledForOrganization("9e3f6b9b-7116-41e7-8be4-a0ff97d4bcd7", {
      ...env,
      NEXT_PUBLIC_BUDDY_DOCUMENTS_ENABLED: "false",
    })).toBe(false);
  });
});
