# ADR-0001: Native SaaS product boundary

- Status: Accepted
- Date: 2026-08-11

## Decision

Buddy LOS is a clean-sheet SaaS product. Its canonical runtime is the code, schema, policies, and audited behavior contained in this repository and its dedicated Vercel and Supabase projects.

The product uses native UUID identifiers, organization-scoped authorization, explicit workflow state, immutable audit events, and provider-neutral application boundaries. Outside systems may be integrated later, but none defines the Buddy data model or authorization model.

## Consequences

- Buddy owns an independent product vocabulary and schema.
- Every customer organization is isolated by database-enforced row-level security.
- Lending state changes are governed commands, not arbitrary row edits.
- Optional services are replaceable adapters rather than architectural authorities.
- Deployment does not imply customer activation or production readiness.
