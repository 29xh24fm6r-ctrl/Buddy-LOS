import { describe, expect, it, vi } from "vitest";
import {
  isTransientAuthReadError,
  readSessionRows,
  SessionReadFailure,
} from "./session-reads";

describe("readSessionRows", () => {
  it("reads memberships before profile during session bootstrap", async () => {
    const order: string[] = [];

    const result = await readSessionRows({
      readMemberships: async () => {
        order.push("memberships");
        return {
          data: [{ organization_id: "org-1", role: "administrator" }],
          error: null,
        };
      },
      readProfile: async () => {
        order.push("profile");
        return { data: { display_name: "Chuck Ogilvie" }, error: null };
      },
      verifyIdentity: vi.fn(async () => true),
    });

    expect(order).toEqual(["memberships", "profile"]);
    expect(result).toMatchObject({
      kind: "ready",
      profile: { display_name: "Chuck Ogilvie" },
    });
  });

  it("revalidates identity and retries one transient profile 401", async () => {
    let attempts = 0;
    const readProfile = vi.fn(async () => {
      attempts += 1;
      return attempts === 1
        ? {
            data: null,
            error: {
              code: "PGRST301",
              message: "JWT expired",
              status: 401,
            },
          }
        : {
            data: { display_name: "Chuck Ogilvie" },
            error: null,
          };
    });
    const verifyIdentity = vi.fn(async () => true);

    const result = await readSessionRows({
      readMemberships: async () => ({ data: [], error: null }),
      readProfile,
      verifyIdentity,
    });

    expect(verifyIdentity).toHaveBeenCalledTimes(1);
    expect(readProfile).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      kind: "ready",
      profile: { display_name: "Chuck Ogilvie" },
    });
  });

  it("fails closed when the transient failure cannot revalidate identity", async () => {
    const readProfile = vi.fn(async () => ({
      data: null,
      error: { code: "PGRST302", message: "Missing bearer" },
    }));

    const result = await readSessionRows({
      readMemberships: async () => ({ data: [], error: null }),
      readProfile,
      verifyIdentity: async () => false,
    });

    expect(result).toEqual({ kind: "unauthenticated" });
    expect(readProfile).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-auth data errors", async () => {
    const readMemberships = vi.fn(async () => ({
      data: null,
      error: { code: "42501", message: "permission denied" },
    }));

    await expect(
      readSessionRows({
        readMemberships,
        readProfile: async () => ({ data: null, error: null }),
        verifyIdentity: vi.fn(async () => true),
      }),
    ).rejects.toMatchObject<Partial<SessionReadFailure>>({
      scope: "memberships",
      code: "42501",
      retried: false,
    });
    expect(readMemberships).toHaveBeenCalledTimes(1);
  });

  it("recognizes the bounded PostgREST JWT error family", () => {
    expect(isTransientAuthReadError({ code: "PGRST301" })).toBe(true);
    expect(isTransientAuthReadError({ code: "PGRST302" })).toBe(true);
    expect(isTransientAuthReadError({ code: "PGRST303" })).toBe(true);
    expect(
      isTransientAuthReadError({
        code: "42501",
        message: "permission denied",
      }),
    ).toBe(false);
  });
});
