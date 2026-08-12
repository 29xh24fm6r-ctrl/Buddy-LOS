# Buddy Underwriter controlled-port boundary

## Decision

Buddy LOS owns tenant identity, borrowers, deals, document bytes and versions, quarantine and malware status, operational workflow, and the durable audit trail. Buddy Underwriter is an optional, separately entitled module that owns derived underwriting artifacts and never becomes a second authority for LOS records.

The first deployment is a modular monolith inside Buddy LOS. A future service extraction must preserve the same versioned contracts and authority boundaries. MCP is reserved for human-facing assistant tools and is not a document-processing transport.

## Product packaging

- **Buddy LOS Core:** system of record and loan operations.
- **Document Intake:** included LOS capability for secure uploads, classification, checklist coverage, and readiness.
- **Buddy Underwriter:** separately entitled extraction, spreading, global cash flow, risk analysis, credit memo, and decision-support capability.
- **Buddy SBA:** separately entitled SBA packaging capability that may depend on Buddy Underwriter outputs.

No entitlement row means the module is disabled. This slice creates no subscriptions, no module activation UI, no underwriting endpoint, and no production activation.

## Authority map

| Record | Authority |
|---|---|
| Organization, membership, role, entitlement | Buddy LOS |
| Borrower, application, deal and workflow state | Buddy LOS |
| Document bytes, version, hash, scan status and retention | Buddy LOS |
| Extraction evidence and financial spread | Buddy Underwriter module |
| Risk assessment and credit memo draft | Buddy Underwriter module |
| Human approval, conditions, decision and audit event | Buddy LOS |

## Contract rules

Every underwriting request carries the organization, deal, immutable document-version identifiers, SHA-256 hashes, idempotency key, correlation ID, and contract version. Every artifact carries its schema and engine versions, source evidence, confidence when applicable, and human-review status.

The module must fail closed when entitlement, tenant identity, clean-document authorization, document hash, contract version, or idempotency evidence is absent or invalid. AI output is proposed evidence and analysis; it cannot silently mutate LOS truth or approve credit.

## Next controlled-port slices

1. Authorized underwriting job command and durable outbox, still default-off. **Implemented; execution remains unavailable.**
2. Port Buddy document classification and extraction behind provider-neutral adapters. **Runtime implemented default-off; provider selection and activation remain uncommissioned.**
3. Port normalized financial facts and spreading with provenance fixtures. **Contract and storage foundation implemented; calculations remain disconnected.**
4. Port global cash flow, risk, collateral and policy analysis.
5. Port credit memo assembly and human review/approval boundaries.
6. Port SBA packaging as a separately entitled downstream module.

Each slice requires tenant-isolation tests, source-parity fixtures, retry and recovery evidence, and explicit activation approval.
