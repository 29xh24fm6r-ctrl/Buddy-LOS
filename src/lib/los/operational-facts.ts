import type { DealSummary } from "./read-model";

export type DealTaskFact = { status: string; dueAt: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;

export function dealTaskFacts(tasks: readonly DealTaskFact[], now = new Date()) {
  const today = startOfUtcDay(now).getTime();
  const open = tasks.filter((task) => task.status === "open");
  return {
    open: open.length,
    completed: tasks.filter((task) => task.status === "completed").length,
    overdue: open.filter((task) => dateValue(task.dueAt) !== null && dateValue(task.dueAt)! < today).length,
    dueSoon: open.filter((task) => {
      const due = dateValue(task.dueAt);
      return due !== null && due >= today && due - today <= 7 * DAY_MS;
    }).length,
  };
}

export function missingDealFacts(deal: DealSummary) {
  const facts: string[] = [];
  if (deal.requestedAmount === null && deal.approvedAmount === null) facts.push("Loan amount");
  if (!deal.productType) facts.push("Product");
  if (!deal.expectedCloseDate) facts.push("Target close");
  return facts;
}

export function dealProfileCompleteness(deal: DealSummary) {
  return Math.round((3 - missingDealFacts(deal).length) / 3 * 100);
}

export function isPastTargetClose(deal: DealSummary, now = new Date()) {
  const close = dateValue(deal.expectedCloseDate);
  return close !== null && close < startOfUtcDay(now).getTime();
}

export function closesWithinDays(deal: DealSummary, days: number, now = new Date()) {
  const close = dateValue(deal.expectedCloseDate);
  const today = startOfUtcDay(now).getTime();
  return close !== null && close >= today && close - today <= days * DAY_MS;
}

export function boardedPortfolioDeals(deals: readonly DealSummary[]) {
  return deals.filter((deal) => deal.stage === "servicing" || deal.stage === "closed");
}

function dateValue(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(parsed) ? null : parsed;
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
