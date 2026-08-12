# Governed underwriting job outbox

This slice creates the authorized request boundary for the separately entitled Buddy Underwriter module. An authenticated owner, administrator, or assigned underwriter may request analysis only for an active deal in their tenant and only with immutable document versions that have completed security scanning with a clean result.

The command snapshots each document version, SHA-256 hash, and media type; creates a versioned underwriting job; creates a private durable outbox event; and appends an audit event in one database transaction. Repeated requests with the same tenant idempotency key return the original job, while conflicting reuse fails closed.

No outbox claim function, worker endpoint, provider call, AI execution, subscription administration, or production activation is included. The outbox cannot be read or changed by ordinary authenticated clients. A later slice must add leased worker execution, recovery transitions, result ingestion, and exact source-parity evidence before processing can occur.
