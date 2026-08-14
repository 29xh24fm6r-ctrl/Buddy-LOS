# Internal Golden-Loan Factory

This release completes one governed commercial-loan path from an existing intake record through document readiness, underwriting, certified credit memo, committee vote, human credit decision, closing conditions, funding authorization, boarding, and portfolio monitoring.

## Release boundary

- Installed default-off. The web runtime requires `BUDDY_GOLDEN_LOAN_FACTORY_ENABLED=true` and the active organization ID in `BUDDY_GOLDEN_LOAN_FACTORY_ORGANIZATION_IDS`.
- Internal-only. No organization identifier is hard-coded and no customer is enrolled by this change.
- Human-controlled. Credit decisions, funding, and boarding are separate authenticated commands with role checks, active underwriting entitlement, idempotency, and audit evidence.
- Canonical. The factory uses the existing deal, credit, closing, funding, servicing, covenant, and audit tables. It creates no parallel loan ledger.
- Reversible. Removing the organization from the cohort or setting the enabled flag to anything other than `true` removes command access without deleting records.

## Activation gate

Merging this PR does not authorize activation. Before any internal activation, apply the migration through the normal reviewed Supabase migration path, configure the two server-side variables for the single internal organization, redeploy the exact approved commit, and record one ordinary-user golden-loan certification. Production and external-customer activation require separate approval.

## Evidence scope

`npm run check` includes the golden-loan factory contract verifier plus lint, type checking, unit tests, and production build. A green check proves the repository contract; it does not by itself prove a live database migration, deployed identity, ordinary-user completion, or production readiness.
