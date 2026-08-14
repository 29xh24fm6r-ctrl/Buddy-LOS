# Document scanner provider contract

Buddy LOS remains vendor-neutral. A scanner may be selected only after security, privacy, legal, reliability, data-residency, file-support, and commercial review. Configuration of a provider name or endpoint is not evidence of approval.

## Submission contract

The scan worker sends one HTTPS `POST` multipart request. Redirects are rejected so the bearer credential and private document cannot be forwarded to an unapproved host. The request carries:

- `Authorization: Bearer <server-only API key>`
- `Idempotency-Key: <durable Buddy scan-job UUID>`
- `Accept: application/json`
- the quarantined object under `file`, named with the opaque document UUID rather than the borrower's original filename
- `contractVersion=buddy-document-scan-v1`
- `provider`, `organizationId`, `documentId`, `sha256`, `mimeType`, and the approved HTTPS `callbackUrl`
- `callbackAuthentication=hmac-sha256-v1`

The provider must return a JSON response no larger than 4 KiB containing a stable `runId` between 2 and 200 characters. An authenticated provider may also return the bounded verdict `result` (`clean` or `rejected`) so an isolated sandbox can be certified while Buddy's callback and document feature gates remain disabled. This response is operational evidence only: it does not authorize a download or replace the signed callback and database transition. HTTP `408`, `429`, and `5xx` responses are retryable. Other non-success responses, malformed JSON, unsupported media types, oversized responses, and invalid run identities are terminal for that job and remain quarantined for operator review. Response bodies are never copied into customer-visible or durable error messages.

## Callback contract

The provider callback must use `application/json`, stay below 32 KiB, and include:

- `x-buddy-scanner-timestamp`: Unix seconds within five minutes of receipt
- `x-buddy-scanner-signature`: `sha256=<lowercase hex HMAC>` over `<timestamp>.<raw request body>`
- the same provider, organization, document, run identity, and SHA-256 accepted at submission
- a result of `clean` or `rejected`, plus optional bounded engine and signature versions

Buddy re-downloads the private object and rechecks size, MIME type, and SHA-256 before recording the callback. The database transition also binds the result to the claimed provider and run identity. Clean status alone authorizes document download; rejected or ambiguous objects remain unavailable.

## Commissioning evidence

Before activation, the selected provider must pass sandbox and deployed tests for clean files, malware fixtures approved for security testing, duplicate submission, callback replay, signature tampering, delayed callback, timeout, rate limiting, provider outage, redirect response, malformed response, oversized response, and recovery after an expired Buddy lease. Evidence must be attached to the exact Git SHA, Vercel deployment, Supabase migration head, and provider contract approval.

This slice does not select a provider, transmit a production document, add a schedule, configure secrets, or enable a document gate.
