# Governed document upload exchange

The upload exchange avoids Vercel binary request limits by issuing an exact-path Supabase signed upload token only after the authenticated user passes tenant, deal-assignment, requirement, MIME, size, lineage, and idempotency checks. Direct Storage listing and reading remain unavailable.

After the browser uploads directly to the private bucket, a trusted server downloads the stored object, verifies its reserved size, computes SHA-256 over the persisted bytes, and atomically moves the document version from `pending_upload` to `quarantined`. Only the separate scanner authority can later mark it `clean` or `rejected`.

The route remains disabled unless `BUDDY_DOCUMENT_UPLOADS_ENABLED=true` and the server secret is configured. This PR does not activate uploads or add a `storage.objects` policy. Browser integration, failure cleanup, scanner commissioning, and live persistence/readback evidence remain required before customer use.
