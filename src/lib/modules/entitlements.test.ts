import { describe, expect, it } from "vitest";
import { decideModuleAccess, type ProductModuleEntitlement } from "./entitlements";

const entitlement = (
  overrides: Partial<ProductModuleEntitlement> = {},
): ProductModuleEntitlement => ({
  organizationId: "organization-1",
  module: "underwriting",
  status: "active",
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: null,
  ...overrides,
});

describe("product module entitlements", () => {
  const now = new Date("2026-08-12T12:00:00.000Z");

  it("is default-off when the underwriting entitlement is absent", () => {
    expect(decideModuleAccess("underwriting", [], now)).toEqual({
      allowed: false,
      reason: "missing",
    });
  });

  it("allows only current active or trial entitlements", () => {
    expect(decideModuleAccess("underwriting", [entitlement()], now).allowed).toBe(true);
    expect(decideModuleAccess("underwriting", [entitlement({ status: "trial" })], now).allowed).toBe(true);
    expect(decideModuleAccess("underwriting", [entitlement({ status: "suspended" })], now)).toEqual({
      allowed: false,
      reason: "inactive",
    });
    expect(decideModuleAccess("underwriting", [entitlement({ endsAt: now.toISOString() })], now)).toEqual({
      allowed: false,
      reason: "expired",
    });
  });

  it("fails closed on invalid or future activation windows", () => {
    expect(decideModuleAccess("underwriting", [entitlement({ startsAt: "invalid" })], now).allowed).toBe(false);
    expect(decideModuleAccess("underwriting", [entitlement({ startsAt: "2027-01-01T00:00:00.000Z" })], now)).toEqual({
      allowed: false,
      reason: "not_started",
    });
  });
});
