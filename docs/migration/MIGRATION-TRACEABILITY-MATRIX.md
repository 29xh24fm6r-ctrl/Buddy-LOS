# Migration traceability matrix

This is the Phase 0 control ledger. `Uninventoried` means no implementation or parity claim is allowed yet.

| Legacy area | Source dependency | Target boundary | Current state | Exit evidence |
|---|---|---|---|---|
| App shell/workspaces | Power Apps Code App | Next.js App Router | Foundation only | Reachable routes and authorization tests |
| Identity | Entra + Dataverse user profile | Supabase Auth + memberships | Uninventoried | Cross-tenant and revoked-user tests |
| Deal/borrower data | Dataverse generated services | Postgres repositories | Uninventoried | Field/key mapping and reconciliation |
| Loan workflow | Dataverse plugins/custom APIs | Transactional command service | Uninventoried | Rule ledger and transition parity tests |
| Documents | SharePoint + Dataverse file fields | Private Supabase Storage | Uninventoried | Upload/read/replace/delete/retention proof |
| Automation | Power Automate | Durable workflow/job adapters | Uninventoried | Retry, idempotency, dead-letter proof |
| Calendar/email/meetings | Outlook + Teams | Optional provider adapters | Uninventoried | Core LOS works with integrations off |
| AI/search/extraction | Azure/Copilot services | Provider-neutral server adapters | Uninventoried | Source-bound output and human review proof |
| Audit/evidence | Dataverse records and documents | Append-only Postgres events | Uninventoried | Counts, hashes, lineage, readback |

## Required detailed ledgers

- Entity/field/relationship/alternate-key mapping
- Option-set and state/status mapping
- Plugin/custom-API invariant inventory
- Power Automate flow and trigger inventory
- Live data volume and attachment inventory
- Role, team, entitlement, and record-scope mapping
- Retention, legal-hold, and audit requirements
