# Controlled build arc

## Gate 0 — Foundation

Scope: repository boundary, buildable Next.js shell, fail-closed configuration, architecture and traceability records, CI.

Stop conditions:

- No Supabase production project is connected.
- No legacy records are copied.
- No business write is implemented.
- No Microsoft integration is activated.

## Gate 1 — Inventory

Complete exact entity, rule, flow, authorization, file, and live-volume inventories. Resolve contradictions before schema design.

## Gate 2 — Tenant security

Implement organization membership and RLS in an isolated local/test Supabase environment. Require adversarial cross-tenant tests and database advisor review.

## Gate 3 — First vertical slice

Migrate one read-only banker pipeline, then one governed deal write. Prove reload/resume, concurrency, idempotency, audit lineage, and rollback.

## Gate 4 — Expanded workflows

Proceed domain by domain only when the prior domain has mapping, parity, observed behavior, and recovery evidence.

## Activation boundary

Code, green CI, a Vercel deployment, or a Supabase schema does not authorize production data migration or customer access. Production activation requires a separate approved runbook and observed acceptance evidence.
