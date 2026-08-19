export type SessionReadError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number;
};

export type SessionReadResponse<T> = {
  data: T | null;
  error: SessionReadError | null;
};

export type SessionRowReader<Memberships, Profile> = {
  readMemberships: () => Promise<SessionReadResponse<Memberships>>;
  readProfile: () => Promise<SessionReadResponse<Profile>>;
  verifyIdentity: () => Promise<boolean>;
};

export type SessionRows<Memberships, Profile> =
  | { kind: "ready"; memberships: Memberships | null; profile: Profile | null }
  | { kind: "unauthenticated" };

export type SessionReadScope = "memberships" | "profile";

export class SessionReadFailure extends Error {
  readonly scope: SessionReadScope;
  readonly code: string | null;
  readonly status: number | null;
  readonly retried: boolean;

  constructor(scope: SessionReadScope, error: SessionReadError, retried: boolean) {
    super(`Unable to read authenticated ${scope}.`);
    this.name = "SessionReadFailure";
    this.scope = scope;
    this.code = error.code ?? null;
    this.status = error.status ?? null;
    this.retried = retried;
  }
}

const RETRYABLE_AUTH_CODES = new Set(["PGRST301", "PGRST302", "PGRST303"]);

export function isTransientAuthReadError(error: SessionReadError): boolean {
  if (error.status === 401) return true;
  if (error.code && RETRYABLE_AUTH_CODES.has(error.code)) return true;

  const message = error.message ?? "";
  return /\b(?:jwt|bearer|access token)\b.*\b(?:expired|invalid|missing|decode|parse)\b/i.test(message);
}

async function readWithAuthRecovery<T>(
  scope: SessionReadScope,
  read: () => Promise<SessionReadResponse<T>>,
  verifyIdentity: () => Promise<boolean>,
): Promise<{ kind: "ready"; data: T | null } | { kind: "unauthenticated" }> {
  const first = await read();
  if (!first.error) return { kind: "ready", data: first.data };
  if (!isTransientAuthReadError(first.error)) throw new SessionReadFailure(scope, first.error, false);

  if (!(await verifyIdentity())) return { kind: "unauthenticated" };

  const retry = await read();
  if (retry.error) throw new SessionReadFailure(scope, retry.error, true);
  return { kind: "ready", data: retry.data };
}

export async function readSessionRows<Memberships, Profile>(
  reader: SessionRowReader<Memberships, Profile>,
): Promise<SessionRows<Memberships, Profile>> {
  // Keep the bootstrap reads sequential. Immediately after a server-action sign-in,
  // concurrent PostgREST requests can observe different points in the cookie handoff.
  const memberships = await readWithAuthRecovery(
    "memberships",
    reader.readMemberships,
    reader.verifyIdentity,
  );
  if (memberships.kind === "unauthenticated") return memberships;

  const profile = await readWithAuthRecovery(
    "profile",
    reader.readProfile,
    reader.verifyIdentity,
  );
  if (profile.kind === "unauthenticated") return profile;

  return {
    kind: "ready",
    memberships: memberships.data,
    profile: profile.data,
  };
}
