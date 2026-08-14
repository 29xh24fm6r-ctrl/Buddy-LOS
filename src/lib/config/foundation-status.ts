export type FoundationStatus = {
  supabaseConfigured: boolean;
  authEnabled: boolean;
  readsEnabled: boolean;
  writesEnabled: boolean;
  documentsEnabled: boolean;
  integrationsEnabled: boolean;
};

const enabled = (value: string | undefined) => value === "true";

export function readFoundationStatus(
  env: Record<string, string | undefined> = process.env,
): FoundationStatus {
  const supabaseConfigured = Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );

  return {
    supabaseConfigured,
    authEnabled: supabaseConfigured && enabled(env.NEXT_PUBLIC_BUDDY_AUTH_ENABLED),
    readsEnabled: supabaseConfigured && enabled(env.NEXT_PUBLIC_BUDDY_READS_ENABLED),
    writesEnabled: supabaseConfigured && enabled(env.NEXT_PUBLIC_BUDDY_WRITES_ENABLED),
    documentsEnabled: supabaseConfigured && enabled(env.NEXT_PUBLIC_BUDDY_DOCUMENTS_ENABLED),
    integrationsEnabled: enabled(env.NEXT_PUBLIC_BUDDY_INTEGRATIONS_ENABLED),
  };
}

export function writesEnabledForOrganization(
  organizationId: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!readFoundationStatus(env).writesEnabled) return false;

  const allowedOrganizations = new Set(
    (env.BUDDY_WRITES_ORGANIZATION_IDS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  return allowedOrganizations.has(organizationId.trim().toLowerCase());
}

export function documentsEnabledForOrganization(
  organizationId: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!readFoundationStatus(env).documentsEnabled) return false;

  const allowedOrganizations = new Set(
    (env.BUDDY_DOCUMENTS_ORGANIZATION_IDS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  return allowedOrganizations.has(organizationId.trim().toLowerCase());
}
