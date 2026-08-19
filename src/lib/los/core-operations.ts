import type { OrganizationRole } from "@/lib/auth/access-context";

export const borrowerKinds = ["business", "individual", "trust", "government", "nonprofit", "other"] as const;
export const contactKinds = ["email", "phone", "address", "website", "other"] as const;
export const activityKinds = ["call", "email", "meeting", "note", "referral", "other"] as const;
export const relationshipKinds = ["borrower", "guarantor", "owner", "officer", "advisor", "vendor", "affiliate", "other"] as const;
export const referralStatuses = ["received", "contacted", "qualified", "converted", "declined", "lost"] as const;
export const appointmentStatuses = ["scheduled", "completed", "cancelled"] as const;

export function canOperateCore(role: OrganizationRole) {
  return role === "owner" || role === "administrator" || role === "lender";
}

export function requiredText(form: FormData, name: string, min: number, max: number) {
  const value = String(form.get(name) ?? "").trim();
  return value.length >= min && value.length <= max ? value : null;
}

export function optionalText(form: FormData, name: string, max: number) {
  const value = String(form.get(name) ?? "").trim();
  return value.length <= max ? value : null;
}

export function enumValue<T extends readonly string[]>(form: FormData, name: string, values: T) {
  const value = String(form.get(name) ?? "");
  return values.includes(value) ? value as T[number] : null;
}

export function uuidValue(form: FormData, name: string, optional = false) {
  const value = String(form.get(name) ?? "").trim();
  if (optional && !value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
}

export function dateTimeValue(form: FormData, name: string, optional = false) {
  const value = String(form.get(name) ?? "").trim();
  if (optional && !value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

export function dateTimeValueInZone(form: FormData, name: string, timezone: string, optional = false) {
  const value = String(form.get(name) ?? "").trim();
  if (optional && !value) return null;
  if (!value) return undefined;
  if (/([zZ]|[+-]\d\d:\d\d)$/.test(value)) return dateTimeValue(form, name, optional);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return undefined;
  const desired = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0));
  const zone = safeTimeZone(timezone);
  let candidate = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
    const observed = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
    const delta = desired - observed;
    candidate += delta;
    if (delta === 0) return new Date(candidate).toISOString();
  }
  return undefined;
}

export function decimalValue(form: FormData, name: string, optional = false) {
  const raw = String(form.get(name) ?? "").trim();
  if (optional && !raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function validContactValue(kind: typeof contactKinds[number], value: string) {
  if (kind === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (kind === "website") { try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; } }
  if (kind === "phone") return /^[+()\-\s.0-9]{7,30}$/.test(value);
  return value.trim().length > 0;
}

export function safeTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    return "UTC";
  }
}

export function formatInTimeZone(value: string, timezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: safeTimeZone(timezone) }).format(date);
}

export function formatDateTimeLocalInZone(value: string, timezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timezone), year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
