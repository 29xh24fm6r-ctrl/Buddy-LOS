import type { OrganizationRole } from "@/lib/auth/access-context";

export const DEAL_STAGE_ORDER = ["prospect", "intake", "application", "underwriting", "credit_approval", "commitment", "closing", "funding", "boarding", "servicing"] as const;

export type DealSummary = {
  id: string;
  borrowerId: string;
  borrowerName: string;
  dealNumber: string | null;
  name: string;
  productType: string | null;
  requestedAmount: number | null;
  approvedAmount: number | null;
  stage: string;
  expectedCloseDate: string | null;
  updatedAt: string;
};

export type PipelineLane = { stage: string; label: string; deals: DealSummary[]; amount: number };

export type BankerCommandCenterModel = {
  deals: DealSummary[];
  lanes: PipelineLane[];
  totalActive: number;
  totalExposure: number;
  closingSoon: number;
  needsAttention: number;
};

const terminalStages = new Set(["closed", "withdrawn", "declined"]);

export function canReadInstitutionPipeline(role: OrganizationRole) {
  return role === "owner" || role === "administrator" || role === "viewer";
}

export function deriveBankerCommandCenter(deals: readonly DealSummary[], now = new Date()): BankerCommandCenterModel {
  const active = deals.filter((deal) => !terminalStages.has(deal.stage));
  const nowMs = startOfDay(now).getTime();
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;
  const closingSoon = active.filter((deal) => {
    const close = parseDate(deal.expectedCloseDate);
    return close !== null && close >= nowMs && close - nowMs <= fourteenDays;
  }).length;
  const needsAttention = active.filter((deal) => {
    const close = parseDate(deal.expectedCloseDate);
    return close !== null && close < nowMs;
  }).length;

  const groups = new Map<string, DealSummary[]>();
  for (const deal of active) groups.set(deal.stage, [...(groups.get(deal.stage) ?? []), deal]);
  const known = new Set<string>(DEAL_STAGE_ORDER);
  const orderedStages = [
    ...DEAL_STAGE_ORDER,
    ...[...groups.keys()].filter((stage) => !known.has(stage)).sort(),
  ];
  const lanes = orderedStages
    .map((stage) => {
      const laneDeals = groups.get(stage) ?? [];
      return {
        stage,
        label: stageLabel(stage),
        deals: laneDeals,
        amount: laneDeals.reduce((sum, deal) => sum + (deal.approvedAmount ?? deal.requestedAmount ?? 0), 0),
      };
    })
    .filter((lane) => lane.deals.length > 0);

  return {
    deals: active,
    lanes,
    totalActive: active.length,
    totalExposure: active.reduce((sum, deal) => sum + (deal.approvedAmount ?? deal.requestedAmount ?? 0), 0),
    closingSoon,
    needsAttention,
  };
}

export function stageLabel(stage: string) {
  return stage.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function parseDate(value: string | null) {
  if (!value) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
}

function startOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
