# Buddy LOS release certification runbook

## Current classification

`PRE_RELEASE`. Repository checks prove source consistency only. They do not prove deployment identity, ordinary-user behavior, recovery, entitlement, or activation.

## Certification sequence

1. Deploy an exact reviewed SHA to an isolated environment using Node 22.
2. Apply migrations from zero and record the migration head; run database lint/advisors and the adversarial SQL suite.
3. Observe ordinary-user journeys for every role, including reload, expiry, conflict, forbidden, provider outage, retry, and recovery.
4. Compare banker, CRM, team, manager, portfolio, deal, and administration routes against the approved screenshot baseline.
5. Perform backup restore, queue replay, provider outage, application rollback, and migration forward-repair drills.
6. Copy `release/release-evidence.example.json`, replace every placeholder with observed evidence, and retain open risks.
7. Only after all required evidence is reviewed may the capability ledger move to `RELEASE_CANDIDATE`.

## Activation boundary

Release candidacy does not activate production. Owner approval must name the exact SHA and deployment, organization IDs, modules, monitoring window, rollback owner, and accepted risks. Buddy Underwriter remains independently entitled and cannot mutate canonical credit decisions.

## Rollback

Disable affected feature flags and module entitlements, return traffic to the last certified SHA, preserve immutable evidence, and use a reviewed forward-repair migration for database defects. Never delete audit, decision, funding, or boarding evidence to simulate rollback.
