# Document scan recovery commissioning

This release adds a governed recovery path for terminal document-scan failures. It does not activate any feature flag or modify a live job by itself.

## Control boundary

- Only an authenticated owner or administrator of the document's organization can request recovery.
- Only a quarantined document with a terminal `failed` job and remaining attempts is eligible.
- Prior attempt counts and the original failure remain represented in the append-only audit event.
- An idempotency key permits safe replay without a second recovery transition.
- The API performs one bounded dispatch after requeue. Normal worker retries remain authoritative afterward.

## Release gate

1. Apply the migration in the target environment through the normal migration pipeline.
2. Deploy the exact reviewed application revision with document scanning still default-off outside the approved organization cohort.
3. Confirm the deal workspace shows scan status and exposes **Retry failed scan** only to an owner/administrator for an eligible failed job.
4. In the internal certification organization, recover one known failed quarantined document.
5. Confirm: one `document_scan.requeued` audit event, preserved prior attempt count, a new scanner submission, and either `awaiting_result` or a bounded retryable/failed result.
6. Confirm a repeated request with the same idempotency key does not create a second recovery transition.

## Rollback

Disable `BUDDY_DOCUMENT_SCANNING_ENABLED` or remove the organization from the document cohort. The migration may remain installed: it grants execution only to the service role and performs no work without an authorized API request.

Production activation, retrying a live record, and broadening the organization cohort each require separate approval.
