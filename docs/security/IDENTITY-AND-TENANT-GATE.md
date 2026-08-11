# Identity and tenant gate

Buddy LOS uses Supabase Auth for identity and native Postgres membership records for authorization. Authentication alone never grants institution access.

## Controlled onboarding sequence

1. An authorized operator creates or invites the user through Supabase Auth.
2. The operator creates the user's `profiles` row.
3. The operator adds exactly reviewed `organization_memberships` and role values.
4. The operator verifies that the user can read only those institution records through RLS.
5. The operator verifies that an authenticated user with no membership receives the access-pending screen.
6. Only after cross-tenant and session tests pass is `NEXT_PUBLIC_BUDDY_AUTH_ENABLED=true` set for the intended Vercel environment.

Public signup is not part of this gate. Database writes, organization creation, invitations, role changes, and account recovery remain operator-controlled until governed administration commands are implemented.

## Runtime behavior

- Next.js Proxy refreshes and validates Supabase session claims only when authentication is enabled.
- Identity routes are dynamically rendered and never shared across users.
- The requested institution cookie is treated only as a preference; it is accepted only when the institution appears in the user's active membership set.
- Roles map to bounded workspaces. Missing or unknown authorization fails closed.
- Sign-out clears the local browser session.

## Activation evidence required

- Exact deployed Vercel commit and environment configuration.
- Exact Supabase migration identity.
- Successful login, refresh, logout, expired-session, and revoked-session observations.
- Two-tenant adversarial tests proving no cross-institution reads.
- No-membership and inactive-membership denial observations.
- Role-to-workspace checks for every supported role.

This implementation is installed default-off. Merging it does not authorize activation.
