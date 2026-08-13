# Buddy LOS remaining factory build specification

## Purpose

This specification completes the native SaaS port after PR 58 while preserving the approved screenshot baseline. It combines the remaining implementation into the lowest safe number of review units: **three pull requests**.

The factory may execute continuously across all three branches and prepare all three as draft pull requests. No pull request may be merged, no database migration may be applied to production, and no capability may be activated for a customer organization without explicit owner approval.

## Non-negotiable product contract

- Buddy LOS remains the authoritative multi-tenant system of record.
- Vercel and Supabase replace the Microsoft runtime; no Dataverse, Power Apps, SharePoint, Microsoft identity, or Microsoft workflow dependency may be introduced.
- The PR 58 visual baseline is protected. Functional work must use the established banker, CRM, team, manager, portfolio, deal, and administration layouts rather than redesigning them.
- Every durable row is organization-scoped. Browser clients never receive privileged database credentials.
- Writes use server-governed commands with authorization, prerequisites, optimistic concurrency, idempotency, correlation, and append-only audit evidence.
- Buddy Underwriter remains separately entitled, private, fail-closed, and independently sellable. Its output is proposed analysis; human approval remains in Buddy LOS.
- A green build, deployed endpoint, or available schema does not constitute activation.

## Factory operating model

### Continuous execution

The factory may prepare PRs 2 and 3 before earlier PRs merge by using a stacked branch chain:

1. `factory/core-operations` from refreshed `origin/main`.
2. `factory/lending-lifecycle` from PR 1 head.
3. `factory/release-certification` from PR 2 head.

After an earlier PR merges, rebase the next branch onto refreshed `origin/main`, rerun its full required checks, and update the draft PR. Do not merge automatically.

### Required evidence on every PR

Each PR description must include:

- exact base and head SHA;
- migrations and runtime flags introduced;
- authority and threat-boundary changes;
- tests run and their results;
- observed browser scenarios;
- rollback procedure;
- capabilities that remain default-off;
- explicit statement that production activation was not performed.

### Stop conditions

Stop the affected stream and mark it HOLD when any of the following occurs:

- cross-tenant access succeeds;
- a browser can bypass a governed write command;
- an irreversible migration lacks a tested rollback or forward-repair plan;
- duplicate execution changes durable outcomes;
- provider output can directly approve credit or mutate canonical LOS truth;
- required audit evidence is missing;
- the screenshot baseline materially regresses without an approved product decision;
- production secrets, customer data, or privileged credentials appear in code, logs, artifacts, or a PR.

## PR 1 — Native core operations and tenant administration

### Objective

Turn the existing authenticated workspaces from read-oriented visual parity into a complete governed operating foundation.

### Scope

1. Reconcile the repository's product plan, deployment notes, feature flags, and commissioning documents with the actual merged system. Add a capability ledger with `implemented`, `deployed`, `certified`, `entitled`, and `active` as distinct states.
2. Complete identity and institution onboarding:
   - secure invitation and acceptance;
   - session refresh, expiry, sign-out, revocation, and access-pending behavior;
   - institution, team, membership, role, and user administration;
   - operator-controlled organization creation;
   - role-change and membership-removal evidence.
3. Complete governed CRM operations:
   - companies/borrowers and contacts;
   - relationships and assignments;
   - activities, notes, referrals, calendar records, tasks, and follow-ups;
   - authorized search and filters;
   - server commands for create, update, archive, assign, and status transitions.
4. Complete the first lending loop:
   - governed loan/deal intake;
   - borrower and guarantor linkage;
   - product, amount, structure, pricing, ownership, stage, and target-date fields;
   - tasks, due diligence, alerts, requirements, and controlled lifecycle transitions;
   - reload, resume, conflict, retry, and recovery behavior.
5. Replace remaining placeholders in the surfaced banker, CRM, team, manager, and deal workspaces when a native authority exists. When an authority does not yet exist, retain an explicit unavailable state rather than inferred or fabricated metrics.
6. Establish append-only audit and outbox foundations used by later factory PRs.

### Database and security requirements

- RLS and explicit grants on every exposed table.
- Composite tenant foreign keys for cross-record relationships.
- Service-role writes only through bounded server commands.
- Adversarial tests for two organizations, removed membership, wrong role, forged identifiers, and direct REST access.
- Idempotency and optimistic-concurrency tests for every mutable command family.
- Database advisors reviewed with no unexplained critical security finding.

### Exit gate

- An invited internal user can sign in and operate CRM and a loan from intake through review readiness.
- State survives reload and a new session.
- Unauthorized and cross-tenant operations fail closed.
- All visible counts are derived from durable native records.
- No downstream underwriting, approval, funding, or servicing capability is activated by this PR.

## PR 2 — Documents, underwriting, credit, closing, and portfolio lifecycle

### Objective

Complete the end-to-end commercial lending lifecycle while retaining separate authorities, entitlements, and human decision boundaries.

### Scope

1. Complete private document operations:
   - requirement creation and document request;
   - private upload, immutable versioning, hashing, download authorization, and access events;
   - quarantine, malware scan, rejection, release, review, retention, cleanup, and deletion evidence;
   - idempotent callbacks, retries, outage recovery, and poison-job handling.
2. Commission the Buddy Underwriter integration inside the application boundary:
   - entitled organization and module checks;
   - durable underwriting command and outbox worker;
   - private provider authentication and versioned request contract;
   - result ingestion with source evidence, confidence, model/engine version, and human-review status;
   - idempotent replay and deterministic duplicate handling;
   - explicit provider outage and recovery behavior.
3. Complete underwriting artifacts:
   - classification and extraction;
   - normalized financial facts and spreading;
   - global cash flow, collateral, risk, policy exceptions, and conditions;
   - credit memo assembly with source traceability;
   - human review, change history, approval, decline, and return-for-rework boundaries.
4. Complete approval and committee workflows:
   - authority matrix and approval routing;
   - voting/decision evidence, conditions, exceptions, and committee record;
   - no AI-initiated or provider-initiated final credit decision.
5. Complete closing through boarding:
   - closing checklist and exceptions;
   - document readiness and final approvals;
   - funding authorization and funding evidence;
   - boarding handoff with reconciliation and recovery.
6. Complete portfolio operations:
   - servicing record and payment/loan status integration boundary;
   - annual reviews, covenants, ticklers, watchlists, risk-rating history, alerts, profitability, and portfolio reporting;
   - durable schedules, escalation, ownership, and completion evidence.
7. Complete provider-neutral communications and scheduling required by these workflows. Delivery status, consent, template version, recipient, correlation, and failure evidence must be durable.

### UI requirements

- Populate the established deal cockpit, due-diligence, manager, team, portfolio, and administration surfaces from native records.
- Preserve established layouts and terminology.
- Every action provides pending, success, validation, conflict, forbidden, provider-unavailable, retry, and recovery behavior.
- Empty states lead to an authorized next action; they do not fabricate sample production data.

### Exit gate

- One internal test loan can move from governed intake through documents, underwriting, human credit decision, closing, funding, boarding, and portfolio monitoring.
- The same flow resumes correctly after reload and interrupted execution.
- Cross-tenant, tamper, replay, duplicate, provider-outage, and recovery tests pass.
- Buddy Underwriter remains separately entitled and default-off for every organization not explicitly approved.
- External customer activation remains prohibited.

## PR 3 — Commercial SaaS controls and release certification

### Objective

Convert the completed internal product into an operable, recoverable, separately sellable bank and credit-union SaaS release candidate.

### Scope

1. Complete commercial administration:
   - product catalog and module entitlements;
   - subscription and billing-provider boundary;
   - plan changes, suspension, cancellation, renewal, and entitlement reconciliation;
   - institution branding and governed configuration;
   - support/operator access with reason, expiry, and audit evidence.
2. Complete observability and operations:
   - structured logs without document or borrower content;
   - metrics for command failures, queues, provider calls, retries, latency, and tenant-scoped health;
   - actionable alerts and runbooks;
   - deployment, migration, contract, and engine-version identity;
   - bounded data export, retention, legal hold, and deletion operations.
3. Complete security certification:
   - RLS and server-command adversarial suite;
   - secret and dependency scanning;
   - rate limiting, abuse controls, session and invitation security;
   - storage authorization and signed-link expiry;
   - audit integrity and privileged-operation review;
   - documented penetration-test readiness and remediation ledger.
4. Complete resilience certification:
   - backup and point-in-time recovery evidence;
   - restore drill in an isolated environment;
   - queue replay, provider outage, partial failure, and rollback exercises;
   - migration forward-repair and application rollback procedure;
   - recovery objectives recorded and measured.
5. Complete product certification:
   - screenshot-baseline visual comparison for all reference workspaces;
   - responsive desktop and mobile behavior;
   - keyboard and accessibility checks;
   - ordinary-user browser journeys for each role;
   - concurrency, reload, resume, expiry, revocation, and failure recovery;
   - representative internal golden-loan journey;
   - measured performance and cost evidence.
6. Produce the release packet:
   - exact application SHA and deployment URL;
   - exact database migration identity;
   - provider image/engine/contract versions;
   - enabled feature flags and entitled organization IDs;
   - open risks, known limitations, rollback instructions, and activation checklist.

### Exit classification

Passing this PR produces `RELEASE_CANDIDATE`, not automatic production activation.

Production activation requires a separate owner decision that names:

- the exact release identity;
- the exact organization cohort;
- the exact modules being enabled;
- the monitoring window and rollback owner;
- any accepted risks or limitations.

## Factory-wide test matrix

| Boundary | Minimum proof |
|---|---|
| Identity | sign-in, refresh, expiry, sign-out, revocation, invitation replay |
| Tenant isolation | two-tenant reads/writes, forged IDs, removed membership, direct API/REST attempts |
| Governed writes | role, prerequisite, version conflict, duplicate idempotency key, audit correlation |
| Documents | private access, scan/quarantine, hash mismatch, replay, oversize, retention and cleanup |
| Underwriting | entitlement off/on, provider auth, evidence lineage, duplicate result, outage and recovery |
| Credit | human decision required, authority limit, return for rework, immutable decision history |
| Closing/funding | unmet condition denial, authorization, reconciliation, duplicate funding prevention |
| Portfolio | schedule durability, escalation, risk history, annual-review and covenant alerts |
| Administration | least privilege, role change, operator access expiry, entitlement reconciliation |
| Resilience | reload, new session, concurrent edit, queue retry, rollback, restore drill |
| UX parity | reference routes, responsive layout, keyboard path, loading/error/empty/recovery states |

## Explicit exclusions from automatic factory authority

The factory may implement and test these boundaries, but may not independently:

- merge any PR;
- apply production migrations;
- enable a module for an external bank or credit union;
- broaden the currently approved internal Buddy Underwriter cohort;
- create real subscriptions or charge a payment method;
- send real customer communications;
- import real institution data;
- declare regulatory compliance, SOC 2 completion, or general availability.

## Completion definition

The remaining port is complete only when all three PRs are merged, every subsystem satisfies the six-part completion rule in `FULL-SYSTEM-PORT-CONTRACT.md`, the release packet is current, and the owner separately approves the named production cohort. Until then, unfinished capabilities remain default-off and the product must not be represented as generally available to banks or credit unions.
