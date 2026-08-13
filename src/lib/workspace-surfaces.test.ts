import { describe, expect, it } from "vitest";
import { allowedWorkspaceSurfaces, resolveWorkspaceSurface, workspaceSurfaceLabels } from "./workspace-surfaces";

describe("workspace surface entitlement", () => {
  it("gives institution administrators the six original operating workspaces", () => {
    expect(allowedWorkspaceSurfaces("owner")).toEqual(["banker", "crm", "team", "manager", "portfolio", "admin"]);
    expect(Object.values(workspaceSurfaceLabels)).toEqual(["Banker Workspace", "CRM Workspace", "Team Workspace", "Manager Workspace", "Portfolio Workspace", "Admin Workspace"]);
  });

  it("does not permit a requested surface outside the signed-in role", () => {
    expect(resolveWorkspaceSurface("admin", "lender", "banker")).toBe("banker");
    expect(resolveWorkspaceSurface("crm", "lender", "banker")).toBe("crm");
  });

  it("maps operating roles to an original workspace when no surface is requested", () => {
    expect(resolveWorkspaceSurface(undefined, "underwriter", "underwriting")).toBe("team");
    expect(resolveWorkspaceSurface(undefined, "viewer", "read_only")).toBe("portfolio");
  });
});
