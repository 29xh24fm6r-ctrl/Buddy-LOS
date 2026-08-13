import type { OrganizationRole } from "@/lib/auth/access-context";

export const borrowerKinds = ["business", "individual", "trust", "government", "nonprofit", "other"] as const;
export const contactKinds = ["email", "phone", "address", "website", "other"] as const;
export const activityKinds = ["call", "email", "meeting", "note", "referral", "other"] as const;

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
