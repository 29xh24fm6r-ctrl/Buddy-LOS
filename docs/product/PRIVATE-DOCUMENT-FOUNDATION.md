# Private document foundation

The `loan-documents` bucket is private, limited to 50 MB objects, and restricted to approved document/image MIME types. No `storage.objects` policies are installed, so listing, download, upload, replacement, and deletion remain denied.

Tenant-bound metadata records preserve logical document identity, immutable versions, original names, storage paths, MIME type, size, SHA-256 hash, quarantine/scanning disposition, retention date, legal hold, uploader, and supersession lineage. Metadata reads inherit assignment-scoped deal authorization; metadata writes remain closed.

Commissioning requires governed upload preparation, organization/deal-bound object paths, server-side metadata creation, hash verification, malware scanning, quarantine release, signed-download controls, retention recovery tests, and explicit approval.
