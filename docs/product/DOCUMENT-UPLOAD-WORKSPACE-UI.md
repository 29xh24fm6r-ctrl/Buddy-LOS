# Document upload workspace UI

The deal document workspace now connects a requirement row to the governed upload exchange. When the server gate is enabled, a banker can choose an approved file, reserve an immutable version, upload directly to the exact signed private Storage path, and request server-side readback and SHA-256 verification. The workspace refreshes only after the version enters quarantine.

The control validates MIME type, non-empty content, and the 50 MB limit before requesting authorization. Replacement files continue the latest logical-document lineage rather than overwriting bytes. Progress, failure, and quarantine outcomes are visible and accessible; a failed binary upload never invokes finalization.

The file picker is not rendered while `BUDDY_DOCUMENT_UPLOADS_ENABLED` is false. Scanner commissioning, orphan cleanup, production environment configuration, cross-tenant browser tests, persistence after reload, and explicit activation approval remain required.
