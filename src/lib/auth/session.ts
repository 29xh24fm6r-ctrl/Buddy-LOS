import "server-only";
import { cookies } from "next/headers";
import { readFoundationStatus } from "@/lib/config/foundation-status";
import { createClient } from "@/lib/supabase/server";
import { resolveAccessContext, type AccessContext, type MembershipRecord, type OrganizationRole } from "./access-context";

type MembershipRow = { organization_id: string; role: OrganizationRole };
type OrganizationRow = { id: string; name: string; slug: string; institution_type: string | null };

export async function loadAccessContext(): Promise<AccessContext> {
  if (!readFoundationStatus().authEnabled) return { kind: "unauthenticated" };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsError ? null : claimsData?.claims.sub ?? null;
  if (!userId) return { kind: "unauthenticated" };

  const [{ data: membershipData, error: membershipError }, { data: profileData, error: profileError }] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select("organization_id, role")
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase.from("profiles").select("display_name").eq("user_id", userId).maybeSingle(),
  ]);
  if (membershipError) throw new Error("Unable to resolve institution memberships.");
  if (profileError) throw new Error("Unable to resolve user profile.");

  const membershipRows = (membershipData ?? []) as MembershipRow[];
  const organizationIds = membershipRows.map((membership) => membership.organization_id);
  let organizationRows: OrganizationRow[] = [];
  if (organizationIds.length > 0) {
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, slug, institution_type")
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
