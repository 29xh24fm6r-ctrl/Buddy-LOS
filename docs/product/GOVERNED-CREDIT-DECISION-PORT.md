# Governed credit decision port

This factory slice ports Buddy's canonical memo and committee decision concepts without copying its Microsoft-era or single-product runtime. Memo assembly is deterministic, source-bound, hashable, and requires named human certification. Committee routing is policy-versioned and rule-driven.

Final decisions require a reviewed assessment, matching certified memo, resolved material exceptions, owned conditions, committee quorum when required, an authorized human role, and written rationale. The database ledger is immutable and exposes no ordinary-user write grant or autonomous approval function.

The migration is source control only. It is not applied to production by this PR.
