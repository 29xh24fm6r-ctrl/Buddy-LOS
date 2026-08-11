# Security baseline

- Deny by default: every capability flag starts false.
- Tenant isolation: every tenant-owned row has `organization_id`; every exposed table has reviewed RLS.
- Least privilege: explicit Data API grants; no service-role key in browser code or `NEXT_PUBLIC_*` values.
- Trusted authorization: memberships and entitlements live in protected database records or trusted app metadata, never user metadata.
- Governed mutations: writes validate actor, tenant, role, current state, prerequisites, idempotency, and audit payload server-side.
- Document protection: private buckets, scoped paths, signed access, scanning/quarantine, hashes, retention, and legal hold before activation.
- Audit integrity: append-only security and workflow events with correlation and source identifiers.
- Separation: development, preview, test, and production use distinct projects and credentials.
- Supply chain: exact dependency versions and committed lockfile; CI has read-only repository permissions.
- Verification: RLS adversarial tests, database advisors, dependency audit, and end-to-end reload/resume proof are release gates.
