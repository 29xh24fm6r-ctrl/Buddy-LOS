# Clean document access authorization

This slice adds a fail-closed authorization command for private loan-document access. A request succeeds only when the user has an active institution membership, has either an elevated read role or a current assignment to the deal, and targets an active deal's scan-verified `clean` document version.

Every successful authorization is recorded in an append-only access ledger and the general audit ledger. Requests require a reason, are idempotent, and are limited to a 30â€“300 second lifetime. The response contains bounded instructions for a trusted application server, including the private bucket path and verified SHA-256, but it never creates or returns a signed URL.

## Default-off boundary

The command is installed with execution revoked from all runtime roles. This migration adds no `storage.objects` policies and does not enable browser access to objects. Commissioning requires a separate reviewed grant plus a trusted server route that revalidates the authorization and creates a short-lived signed URL without exposing the service-role credential. Live tenant-isolation, expiry, replay, audit, and ordinary-user download evidence remain required.
