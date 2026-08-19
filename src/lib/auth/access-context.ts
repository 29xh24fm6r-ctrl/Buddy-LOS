export type OrganizationRole =
  | "owner"
  | "administrator"
  | "lender"
  | "underwriter"
  | "closer"
  | "viewer";

export type MembershipRecord = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  institutionType: string | null;
  timezone: string;
  role: OrganizationRole;
};

export type AccessContext =
  | { kind: "unauthenticated" }
  | { kind: "membership_required"; userId: string; email: string | null; displayName: string | null }
  | {
      kind: "ready";
      userId: string;
      email: string | null;
      displayName: string | null;
      activeOrganization: MembershipRecord;
      memberships: MembershipRecord[];
      workspace: WorkspaceKey;
    };

export type WorkspaceKey = "administration" | "banker" | "underwriting" | "closing" | "read_only";

export function defaultWorkspace(role: OrganizationRole): WorkspaceKey {
  switch (role) {
    case "owner":
    case "administrator":
      return "administration";
    case "lender":
      return "banker";
    case "underwriter":
      return "underwriting";
    case "closer":
      return "closing";
    case "viewer":
      return "read_only";
  }
}

export function resolveAccessContext(input: {
  userId: string | null;
  email?: string | null;
  displayName?: string | null;
  requestedOrganizationId?: string | null;
  memberships: MembershipRecord[];
}): AccessContext {
  if (!input.userId) return { kind: "unauthenticated" };

  const memberships = [...input.memberships].sort((a, b) =>
    a.organizationName.localeCompare(b.organizationName),
  );
  if (memberships.length === 0) {
    return {
      kind: "membership_required",
      userId: input.userId,
      email: input.email ?? null,
      displayName: input.displayName ?? null,
    };
  }

  const activeOrganization =
    memberships.find((membership) => membership.organizationId === input.requestedOrganizationId) ??
    memberships[0];

  return {
    kind: "ready",
    userId: input.userId,
    email: input.email ?? null,
    displayName: input.displayName ?? null,
    activeOrganization,
    memberships,
    workspace: defaultWorkspace(activeOrganization.role),
  };
}
