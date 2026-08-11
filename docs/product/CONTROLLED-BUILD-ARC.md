# Controlled build arc

## Gate 0 — Native foundation

Dedicated repository, Vercel project, Supabase project, public website, pinned dependencies, CI, and default-off capabilities.

## Gate 1 — Tenant security

Create the native organization, profile, membership, borrower, and application schema. Require RLS on every exposed table, explicit grants, adversarial cross-tenant tests, and clean database advisors.

## Gate 2 — Identity and onboarding

Implement secure sign-in and organization onboarding. Prove session refresh, expiry, sign-out, revoked access, and role changes before enabling product routes.

## Gate 3 — First lending loop

Implement borrower creation and a governed loan application from draft through review readiness. Prove persistence after reload and a new session, optimistic concurrency, idempotency, audit events, and recovery.

## Gate 4 — Documents and underwriting

Add private document handling, structured analysis, conditions, decisions, and human approval boundaries.

## Activation boundary

Code, CI, deployment, and schema availability do not authorize real customer use. Activation requires observed behavior, security review, recovery proof, and explicit approval.
