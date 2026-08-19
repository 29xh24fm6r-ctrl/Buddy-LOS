import { describe, expect, it } from "vitest";
import { defaultWorkspace, resolveAccessContext, type MembershipRecord } from "./access-context";

const bank: MembershipRecord = {
  organizationId: "bank-1",
  organizationName: "Community Bank",
  organizationSlug: "community-bank",
  institutionType: "bank",
  timezone: "America/New_York",
  role: "lender",
};

describe("resolveAccessContext", () => {
  it("fails closed without verified identity", () => {
    expect(resolveAccessContext({ userId: null, memberships: [bank] })).toEqual({ kind: "unauthenticated" });
  });

  it("does not grant access to a user without active membership", () => {
    expect(resolveAccessContext({ userId: "user-1", email: "user@example.com", memberships: [] })).toMatchObject({
      kind: "membership_required",
      userId: "user-1",
    });
  });

  it("honors only a requested organization present in the membership set", () => {
    const creditUnion = { ...bank, organizationId: "cu-1", organizationName: "Credit Union", role: "viewer" as const };
    const context = resolveAccessContext({
      userId: "user-1",
      requestedOrganizationId: "not-authorized",
      memberships: [creditUnion, bank],
    });
    expect(context).toMatchObject({ kind: "ready", activeOrganization: bank, workspace: "banker" });
  });

  it("maps every institution role to a bounded workspace", () => {
    expect(defaultWorkspace("owner")).toBe("administration");
    expect(defaultWorkspace("administrator")).toBe("administration");
    expect(defaultWorkspace("lender")).toBe("banker");
    expect(defaultWorkspace("underwriter")).toBe("underwriting");
    expect(defaultWorkspace("closer")).toBe("closing");
    expect(defaultWorkspace("viewer")).toBe("read_only");
  });
});
