# Governed document upload preparation

The atomic preparation command validates the authenticated actor, tenant, deal access, optional requirement and version lineage, approved MIME type, 50 MB limit, file name, and idempotency key. It reserves an immutable `pending_upload` document version under an organization/deal/logical-document path and records an audit event.

The function is installed with execute revoked from all client roles. It does not issue an upload token and no `storage.objects` policies exist. Commissioning requires a separate reviewed upload mechanism, quarantine transition, hash and malware verification, failure cleanup, and controlled download authorization.
