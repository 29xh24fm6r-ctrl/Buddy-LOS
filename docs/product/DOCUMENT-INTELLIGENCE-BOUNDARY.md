# Buddy Underwriter document-intelligence boundary

This controlled-port slice translates Buddy Underwriter's deterministic-first classification and evidence-bearing extraction behavior into a provider-neutral Buddy LOS contract.

Results must match the requesting tenant, deal, job, immutable document version, and SHA-256 hash. Every classification and extracted field carries source evidence. Engines and classifiers are explicitly versioned. AI-assisted classifications are always stored as needing human review and cannot silently become approved LOS truth.

The artifact table stores derived underwriting evidence only. Buddy LOS remains authoritative for document bytes, scan state, borrower and deal records, workflow, approval, and audit history.

No Gemini, OpenAI, Mistral, OCR, worker claim, artifact-write command, or production flag is connected in this slice. Provider execution and result persistence require separate review, source-parity fixtures, cost controls, retry/recovery behavior, and activation approval.
