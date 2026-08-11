# Governed loan intake

## Delivered slice

The first lending-loop write command creates a borrower, optional primary contacts, draft loan application, intake-stage deal, originating banker assignment, and audit event as one PostgreSQL transaction.

## Authority boundaries

- The command derives the actor from `auth.uid()` and accepts no caller-supplied user ID.
- The active organization is checked against an active membership in the `owner`, `administrator`, or `lender` role.
- Every created record is bound to the same organization ID through composite foreign keys.
- An organization-scoped idempotency key and transaction advisory lock make retries return the original result.
- Direct Data API table writes remain unavailable.
- The function is installed with `EXECUTE` revoked from `PUBLIC`, `anon`, and `authenticated`.

## Commissioning boundary

Merging and applying this migration do not activate loan intake. Commissioning requires a separate reviewed database grant plus the application write flag, followed by tenant-isolation, duplicate-submission, persistence, failure-recovery, and browser evidence against the exact deployed identities.
