import type { OrganizationRole, WorkspaceKey } from "@/lib/auth/access-context";

export const WORKSPACE_SURFACES = ["banker", "crm", "team", "manager", "portfolio", "admin"] as const;
export type WorkspaceSurface = (typeof WORKSPACE_SURFACES)[number];

export const workspaceSurfaceLabels: Record<WorkspaceSurface, string> = {
  banker: "Banker Workspace",
  crm: "CRM Workspace",
  team: "Team Workspace",
  manager: "Manager Workspace",
  portfolio: "Portfolio Workspace",
  admin: "Admin Workspace",
};

export function allowedWorkspaceSurfaces(role: OrganizationRole): readonly WorkspaceSurface[] {
  if (role === "owner" || role === "administrator") return WORKSPACE_SURFACES;
  if (role === "lender") return ["banker", "crm"];
  if (role === "underwriter") return ["team"];
  if (role === "closer") return ["team"];
  return ["portfolio"];
}

export function defaultWorkspaceSurface(workspace: WorkspaceKey): WorkspaceSurface {
  if (workspace === "administration") return "admin";
  if (workspace === "banker") return "banker";
  if (workspace === "read_only") return "portfolio";
  return "team";
}

export function resolveWorkspaceSurface(requested: string | undefined, role: OrganizationRole, workspace: WorkspaceKey): WorkspaceSurface {
  const allowed = allowedWorkspaceSurfaces(role);
  if (requested && allowed.includes(requested as WorkspaceSurface)) return requested as WorkspaceSurface;
  const fallback = defaultWorkspaceSurface(workspace);
  return allowed.includes(fallback) ? fallback : allowed[0]!;
}

export function workspaceSurfaceHref(surface: WorkspaceSurface): string {
  return surface === "crm" ? "/app/crm" : `/app?surface=${surface}`;
}
