# Lending lifecycle authority map

This delivery extends the existing private-document and separately entitled Buddy Underwriter chain. It does not duplicate those engines or allow provider output to decide credit.

| Lifecycle state | Canonical authority | Human boundary |
|---|---|---|
| Document evidence | immutable `deal_documents` versions and scan evidence | only clean authorized versions enter underwriting |
| Underwriting analysis | `underwriting_jobs` and evidence-bound artifacts | outputs remain proposed until reviewed |
| Credit | immutable `credit_decisions` | owner, administrator, or underwriter records the decision |
| Closing | `closing_requirements` | required items must be satisfied or explicitly waived |
| Funding | immutable `funding_authorizations` | owner, administrator, or closer; approved decision and zero open conditions required |
| Boarding | `servicing_accounts` | requires the unique funding authorization |
| Portfolio | covenants and risk history | durable owner, dates, evidence, and human rationale |

All new tables are organization-scoped, RLS protected, read-only through the Data API, and mutated only through bounded commands. Merge does not apply the migration or activate a capability.
