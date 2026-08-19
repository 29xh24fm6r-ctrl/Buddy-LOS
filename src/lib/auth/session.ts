import "server-only";
import { cookies } from "next/headers";
import { readFoundationStatus } from "@/lib/config/foundation-status";
import { createClient } from "@/lib/supabase/server";
import { resolveAccessContext, type AccessContext, type MembershipRecord, type OrganizationRole } from "./access-context";
import { readSessionRows, SessionReadFailure } from "./session-reads";

type MembershipRow = { organization_id: string; role: OrganizationRole };
type ProfileRow = { display_name: string | null };
type OrganizationRow = { id: string; name: string; slug: string; institution_type: string | null; timezone: string };

export async function loadAccessContext(): Promise<AccessContext> {
  if (!readFoundationStatus().authEnabled) return { kind: "unauthenticated" };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsError ? null : claimsData?.claims.sub ?? null;
  if (!userId) return { kind: "unauthenticated" };

  let sessionRows;
  try {
    sessionRows = await readSessionRows({
      readMemberships: async () => {
        const { data, error } = await supabase
          .from("organization_memberships")
          .select("organization_id, role")
          .eq("user_id", userId)
          .eq("is_active", true);
        return { data, error };
      },
      readProfile: async () => {
        const { data, error } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", userId)
          .maybeSingle();
        return { data, error };
      },
      verifyIdentity: async () => {
        const { data, error } = await supabase.auth.getUser();
        return !error && data.user?.id === userId;
      },
    });
  } catch (error) {
    if (error instanceof SessionReadFailure) {
      console.error(JSON.stringify({
        level: "error",
        message: "Authenticated access-context read failed.",
        scope: error.scope,
        code: error.code,
        status: error.status,
        retried: error.retried,
      }));
      if (error.scope === "memberships") {
        throw new Error("Unable to resolve institution memberships.");
      }
      throw new Error("Unable to resolve user profile.");
    }
    throw error;
  }

  if (sessionRows.kind === "unauthenticated") return sessionRows;

  const membershipRows = (sessionRows.memberships ?? []) as MembershipRow[];
  const profileData = sessionRows.profile as ProfileRow | null;
  const organizationIds = membershipRows.map((membership) => membership.organization_id);
  let organizationRows: OrganizationRow[] = [];
  if (organizationIds.length > 0) {
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, slug, institution_type, timezone")
      .in("id", organizationIds);
    if (error) throw new Error("Unable to resolve institution records.");
    organizationRows = (data ?? []) as OrganizationRow[];
  }

  const organizations = new Map(organizationRows.map((organization) => [organization.id, organization]));
  const memberships = membershipRows.flatMap<MembershipRecord>((membership) => {
    const organization = organizations.get(membership.organization_id);
    return organization
      ? [{
          organizationId: organization.id,
          organizationName: organization.name,
          organizationSlug: organization.slug,
          institutionType: organization.institution_type,
          timezone: organization.timezone,
          role: membership.role,
        }]
      : [];
  });
  const cookieStore = await cookies();

  return resolveAccessContext({
    userId,
    email: typeof claimsData?.claims.email === "string" ? claimsData.claims.email : null,
    displayName: profileData?.display_name ?? null,
    requestedOrganizationId: cookieStore.get("buddy-organization-id")?.value ?? null,
    memberships,
  });
}
