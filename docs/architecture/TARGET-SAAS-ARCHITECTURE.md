# Target SaaS architecture

## Runtime

- Next.js App Router on Vercel for server-rendered product surfaces, server actions, and integration route handlers.
- Supabase Auth for identity, backed by explicit organization membership and entitlement records.
- Supabase Postgres for transactional truth, constraints, workflow events, and audited policy decisions.
- Private Supabase Storage for documents after upload security and retention controls are implemented.
- Provider-neutral adapters for email, calendar, meetings, document extraction, search, and AI.

## Boundaries

1. `domain`: pure lending types, calculations, invariants, and transition policies.
2. `application`: authorized commands and queries with idempotency and audit requirements.
3. `infrastructure`: Supabase repositories and optional provider adapters.
4. `web`: server-first UI. Reads occur in Server Components; mutations use governed Server Actions; webhooks use Route Handlers.

## Tenancy model

Every tenant-owned record carries `organization_id`. Access derives from `auth.uid()` joined to active organization memberships and scoped role/entitlement records. Being authenticated is never sufficient authorization.

Tables exposed through the Data API require explicit grants and RLS. Authorization never relies on user-editable metadata. Administrative secrets and service-role keys remain server-only.

## Workflow model

Loan state changes are commands, not arbitrary row updates. Each transition validates the actor, organization, current version, allowed transition, prerequisites, idempotency key, and audit payload in one transaction.
