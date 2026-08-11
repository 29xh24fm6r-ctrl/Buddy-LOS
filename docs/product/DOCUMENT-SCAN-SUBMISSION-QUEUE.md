# Document scan submission queue

This slice adds a durable, server-only submission queue for quarantined document versions. A cron-compatible route claims one eligible job without blocking competing workers, verifies the exact private object and SHA-256 again, sends it through a provider-neutral HTTPS adapter, and binds the accepted provider run to the job before any callback can complete it.

Submission leases expire after two minutes. Transient failures return to quarantine with capped exponential retry timing; permanent failures and exhausted attempts remain quarantined with a terminal failed job for operator review. Queue rows are protected by RLS with all browser privileges revoked. Callback completion must match the organization, document, provider, and run identity recorded at submission.

The worker is disabled unless `BUDDY_DOCUMENT_SCANNING_ENABLED=true`, requires Vercel `CRON_SECRET`, and requires complete HTTPS scanner configuration. No `vercel.json` schedule is registered in this slice: production cadence depends on the selected Vercel plan and approved scan-latency objective. Provider contract tests, rejected-object handling, live retry/recovery evidence, monitoring, and explicit activation approval remain required.
