# Document security and recovery harness

CI now executes a transactional Postgres harness after rebuilding every migration from zero. The harness proves cross-tenant document reads are denied, cross-tenant retention commands fail, legal holds cannot be released through retention extension, expired scanner leases recover without duplicate claims, held documents cannot enter cleanup, and retention governance leaves tenant-bound audit evidence. The transaction rolls back all fixtures.

Application tests separately prove cleanup ordering and recovery: the private object moves before tombstone finalization, a failed initial move records a retry without finalization, and a failed database finalization moves the object back to its original private path before recording the failure. Existing tests continue to cover callback HMAC tampering, stale delivery, malformed evidence, idempotent scan identity, retry bounds, and browser privilege absence.

This is automated pre-merge evidence, not live production certification. Provider sandbox tests, deployed tenant accounts, actual private objects, observed callback replay, outage drills, audit-row inspection, monitoring, and explicit activation approval remain required.
