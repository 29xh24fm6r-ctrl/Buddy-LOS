# Buddy Underwriter runtime

This factory slice adds a durable, leased, recoverable worker boundary for document intelligence. It revalidates clean document status and the immutable SHA-256 snapshot at claim time, downloads exact private objects only through the server-side service client, verifies bytes before submission, validates provider results against the versioned contract, and persists all results as needing human review.

The provider adapter requires HTTPS, bearer authentication, per-document idempotency, bounded responses, timeouts, and redirect denial. Retryable failures return to the durable queue with exponential backoff; terminal failures close the job without exposing provider response bodies.

The runtime is inert unless `BUDDY_UNDERWRITER_RUNTIME_ENABLED=true` and complete server-only provider settings exist. No schedule is registered, no provider is selected, and no production environment is activated by this change.
