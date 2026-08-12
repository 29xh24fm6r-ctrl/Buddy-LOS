# Governed document retention and cleanup

This slice makes document disposition fail closed. Institution owners and administrators may establish or extend a retention date and may place a legal hold with a bounded reason and idempotency key. Retention cannot be shortened, legal hold cannot be released through this command, and a missing retention date means the object is retained indefinitely.

Rejected or superseded objects become cleanup candidates only after their explicit retention date passes and only while no legal hold exists. A candidate receives a 24-hour grace period before a server-only worker may lease it. The worker rechecks eligibility, moves the exact object through the Supabase Storage API into a private deterministic disposal prefix, then records the new path, a durable metadata tombstone, and an audit event. Expired leases recover with bounded retries; retention changes cancel pending cleanup.

Cleanup remains disabled unless `BUDDY_DOCUMENT_CLEANUP_ENABLED=true` and requires `CRON_SECRET`. No production schedule is registered, and this slice performs no permanent purge. Staging move/restore proof, lease-crash recovery, operator monitoring, legal approval of retention rules, a separately governed permanent-purge policy, and explicit activation remain required.
