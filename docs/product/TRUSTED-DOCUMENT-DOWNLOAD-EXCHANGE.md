# Trusted document download exchange

The server-only download route exchanges an authenticated, tenant-scoped clean-document authorization for a private Supabase Storage signed URL. It accepts a bounded business reason and idempotency key, derives the institution from the authenticated access context, fixes the maximum lifetime at 60 seconds, and rejects expired or malformed authorization responses.

The browser never receives the Supabase secret key. The secret-backed client exists only in a `server-only` module and signs the exact private bucket and path returned by the database authorization command. Successful issuance creates a second audit event tied to the original authorization, actor, document, hash, and correlation ID.

## Activation boundary

The user-scoped authorization function is executable by authenticated users, but there is still no `storage.objects` policy. Therefore a database authorization alone cannot read a file. The route remains unavailable unless `BUDDY_DOCUMENT_DOWNLOADS_ENABLED=true` and `SUPABASE_SECRET_KEY` are configured on the server.

Production commissioning still requires Vercel environment configuration, an applied migration identity, private test objects, cross-tenant denial evidence, expiry and replay evidence, audit-row evidence, secret-absence checks in browser bundles and responses, and an explicit release decision.
