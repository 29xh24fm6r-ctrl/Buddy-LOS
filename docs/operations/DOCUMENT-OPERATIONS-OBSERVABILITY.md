# Document operations observability

Buddy exposes a server-only aggregate health contract for the scan and cleanup queues. It reports status counts, work ready now, expired leases, delayed scan callbacks, and the age of the oldest ready item. It does not return organization or document identifiers, borrower data, filenames, storage paths, hashes, provider run identities, or raw error text.

The endpoint is `/api/internal/document-operations/health`. It is unavailable unless `BUDDY_DOCUMENT_OPERATIONS_ENABLED=true` and requires the same strong `CRON_SECRET` bearer authentication as trusted workers. Enabling health reporting does not enable uploads, downloads, scanning, cleanup, or the customer document workspace.

Worker and health invocations write structured JSON to Vercel Runtime Logs using only an operation, bounded outcome, Vercel request identity, and duration. Arbitrary exception messages and document identities are excluded. No external drain or monitoring vendor is configured by this slice.

## Response guide

- `expiredLeases > 0`: investigate worker interruption or execution limits; do not manually mutate queue rows.
- `scan.awaitingResultOver15Minutes > 0`: check provider availability and callback delivery/authentication before retrying anything.
- `failed > 0`: preserve the quarantined object and review the corresponding governed database evidence; never download it through a customer path.
- rising `oldestReadyAgeSeconds`: verify worker cadence, runtime errors, and provider rate limits.
- health endpoint `502` or `503`: treat queue visibility as unavailable; do not infer that the queue is empty.

## Activation boundary

Before operational use, apply and verify the migration, configure the server-only health flag and secret, redeploy the exact release, verify unauthorized access is denied, inspect a successful aggregate response, and confirm Runtime Logs contain no sensitive data. Alert thresholds, notification ownership, retention, and an external drain remain separate approval decisions.
