# Document quarantine completion

The scan-completion command accepts only trusted service-role calls and terminal `clean` or `rejected` results. It locks the document version, binds a lowercase SHA-256 hash, records scanner engine and signature evidence in an append-only ledger, prevents scanner-run identity reuse with conflicting facts, updates the quarantine disposition, and emits an audit event atomically.

The command is installed with execute revoked from every runtime role, including `service_role`. Commissioning requires a separate explicit grant to the approved scanner identity, deployed scanner evidence, rejected-object cleanup, clean-object download controls, and recovery proof.
