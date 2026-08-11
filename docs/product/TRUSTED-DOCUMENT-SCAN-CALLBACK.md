# Trusted document scan callback

The scanner callback route accepts terminal `clean` or `rejected` evidence only while the server-side scan gate is enabled. It authenticates the exact raw request with a five-minute HMAC window, validates bounded scanner identity and evidence, reloads the tenant-bound document metadata, downloads the exact object from the private bucket without caching, and recomputes SHA-256 before recording the result atomically.

The database grant is limited to `service_role`; no browser role or `storage.objects` policy is added. Scanner replay identity, terminal transition rules, immutable hashes, scan evidence, and audit events remain enforced by the existing database command.

This is an inbound evidence exchange, not scanner commissioning. The gate defaults off. A provider must still be selected and contract-tested, quarantine submission and retry orchestration must be implemented, rejected-object handling must be approved, and live cross-tenant, replay, tamper, outage, and recovery evidence must pass before activation.
