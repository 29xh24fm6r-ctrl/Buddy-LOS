# Buddy Underwriter runtime

This factory slice adds a durable, leased, recoverable worker boundary for document intelligence. It revalidates clean document status and the immutable SHA-256 snapshot at claim time, downloads exact private objects only through the server-side service client, verifies bytes before submission, validates provider results against the versioned contract, and persists all results as needing human review.

The provider adapter requires HTTPS, bearer authentication, per-document idempotency, bounded responses, timeouts, and redirect denial. Private Google Cloud Run endpoints also require a Google identity token in `X-Serverless-Authorization`; the provider API key remains in `Authorization`. This preserves both Cloud Run IAM and the independently managed Buddy Underwriter provider boundary. Retryable failures return to the durable queue with exponential backoff; terminal failures close the job without exposing provider response bodies.

The runtime is inert unless `BUDDY_UNDERWRITER_RUNTIME_ENABLED=true` and complete server-only provider settings exist. A private `*.run.app` endpoint fails configuration closed unless `BUDDY_UNDERWRITER_GOOGLE_SERVICE_ACCOUNT_JSON` contains valid credentials for a dedicated caller granted only `roles/run.invoker` on the sandbox service. Store that JSON and the separate provider API key only in Vercel server-side environment variables. No schedule is registered, no entitlement is inserted, and no production environment is activated by this change.

For the approved sandbox connection, configure these server-only values only after reviewing the deployment target:

- `BUDDY_UNDERWRITER_DOCUMENT_INTELLIGENCE_ENDPOINT`: the private sandbox service URL plus `/api/providers/buddy-los/document-intelligence`
- `BUDDY_UNDERWRITER_DOCUMENT_INTELLIGENCE_PROVIDER=buddy-underwriter`
- `BUDDY_UNDERWRITER_DOCUMENT_INTELLIGENCE_API_KEY`: the provider key shared through an approved secret channel
- `BUDDY_UNDERWRITER_GOOGLE_SERVICE_ACCOUNT_JSON`: credentials for the dedicated Cloud Run caller, not the provider runtime identity

Keep `BUDDY_UNDERWRITER_RUNTIME_ENABLED=false` until the Buddy LOS sandbox wiring is explicitly approved. The organization must also have a current `underwriting` entitlement; absence remains default-off.
