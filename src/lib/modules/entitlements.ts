export const PRODUCT_MODULES = ["document_intake", "underwriting", "sba"] as const;

export type ProductModule = (typeof PRODUCT_MODULES)[number];
export type ProductModuleStatus = "trial" | "active" | "suspended" | "expired";

export type ProductModuleEntitlement = {
  organizationId: string;
  module: ProductModule;
  status: ProductModuleStatus;
  startsAt: string;
  endsAt: string | null;
};

export type ModuleAccessDecision =
  | { allowed: true; entitlement: ProductModuleEntitlement }
  | { allowed: false; reason: "missing" | "inactive" | "not_started" | "expired" };

export function decideModuleAccess(
  module: ProductModule,
  entitlements: ProductModuleEntitlement[],
  now = new Date(),
): ModuleAccessDecision {
  const entitlement = entitlements.find((candidate) => candidate.module === module);
  if (!entitlement) return { allowed: false, reason: "missing" };
  if (entitlement.status !== "active" && entitlement.status !== "trial") {
    return { allowed: false, reason: "inactive" };
  }

  const startsAt = Date.parse(entitlement.startsAt);
  if (!Number.isFinite(startsAt) || startsAt > now.getTime()) {
    return { allowed: false, reason: "not_started" };
  }

  if (entitlement.endsAt) {
    const endsAt = Date.parse(entitlement.endsAt);
    if (!Number.isFinite(endsAt) || endsAt <= now.getTime()) {
      return { allowed: false, reason: "expired" };
    }
  }

  return { allowed: true, entitlement };
}
