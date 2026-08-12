import type { OrganizationRole } from "@/lib/auth/access-context";
import type { DealDocumentVersion } from "@/lib/los/queries";

export type UnderwritingJobSummary = {
  id: string;
  status: "queued" | "processing" | "needs_review" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  failureCode: string | null;
};

export function canRequestUnderwriting(role: OrganizationRole) {
  return role === "owner" || role === "administrator" || role === "underwriter";
}

export function latestCleanDocumentVersions(versions: readonly DealDocumentVersion[]) {
  const latest = new Map<string, DealDocumentVersion>();
  for (const version of versions) {
    const current = latest.get(version.logicalDocumentId);
    if (!current || version.versionNumber > current.versionNumber) latest.set(version.logicalDocumentId, version);
  }
  return [...latest.values()]
    .filter((version) => version.securityStatus === "clean" && Boolean(version.sha256))
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
    .slice(0, 100);
}

export function underwritingStatusLabel(status: UnderwritingJobSummary["status"] | null) {
  if (!status) return "Not requested";
  return status.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function underwritingRequestBlocked(input: {
  runtimeEnabled: boolean;
  entitled: boolean;
  role: OrganizationRole;
  eligibleDocumentCount: number;
  latestStatus: UnderwritingJobSummary["status"] | null;
}) {
  if (!input.runtimeEnabled) return "runtime_disabled" as const;
  if (!input.entitled) return "entitlement_required" as const;
  if (!canRequestUnderwriting(input.role)) return "role_required" as const;
  if (input.eligibleDocumentCount < 1) return "clean_documents_required" as const;
  if (input.latestStatus === "queued" || input.latestStatus === "processing") return "job_in_progress" as const;
  return null;
}
