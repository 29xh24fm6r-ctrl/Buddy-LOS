# Core LOS domain map

This slice replaces the first Dataverse-shaped records with native, tenant-owned SaaS records. It does not remove the preserved source or claim that downstream workflows are ported.

| Commercial LOS concept | Native Supabase authority | First-slice purpose |
|---|---|---|
| Bank or credit-union environment | `organizations` | Tenant and institution boundary |
| Platform user and role | `profiles`, `organization_memberships` | Auth identity and tenant role |
| Team and team roster | `organization_teams`, `team_memberships` | Banker/operations grouping |
| Client relationship / borrower | `borrowers`, `borrower_contacts` | Canonical customer and governed contact points |
| CRM relationship graph | `borrower_relationships` | Borrower, guarantor, owner, officer, advisor, vendor, and affiliate links |
| Loan deal | `deals` | Canonical pipeline and lifecycle record |
| Assigned banker/team roles | `deal_assignments` | Explicit responsibility without inferred authority |
| Audit entry / timeline evidence | `audit_events` | Append-only correlated evidence |

## Security boundary

- Every domain row is bound to `organization_id`, including composite foreign keys that prevent cross-tenant relationships.
- Every exposed table has RLS enabled and explicit privileges.
- Authenticated users receive tenant-scoped reads only.
- No browser role receives insert, update, or delete privileges in this slice.
- Authorization is derived from active membership records, never user-editable metadata.
- Audit and workflow writes will be introduced through transactional, server-governed commands with role, version, prerequisite, correlation, and idempotency checks.

## Deferred by design

Documents, underwriting, approvals, committee, closing, funding, boarding, servicing, annual reviews, covenants, risk, and communications remain subsequent parity slices. Their source layouts, rules, and tests remain preserved under `reference/commercial-los-source`.
