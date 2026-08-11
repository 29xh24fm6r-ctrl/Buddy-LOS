# Banker command-center parity slice

This slice ports the first live product surfaces from the preserved Commercial LOS into the standalone SaaS runtime.

## Preserved behavior

- Banker operating command center with active-deal, exposure, attention, and closing-soon facts.
- Personal pipeline grouped by the canonical stored stage value.
- Unknown stage values remain visible and labeled instead of being dropped or remapped silently.
- Deal cards lead to a read-only deal cockpit.
- Borrower identity leads to a read-only CRM relationship summary.
- Empty, missing, restricted, and unverified values are shown honestly.

## Native authority

- Supabase Auth supplies verified identity.
- `organization_memberships` resolves institution and role.
- `deal_assignments` scopes ordinary banker/underwriter/closer reads.
- Elevated and viewer roles may receive the institution-wide read model.
- Every Supabase query repeats the organization filter even though RLS also enforces it.
- Borrower access for ordinary users requires at least one currently assigned related deal.

## Default-off boundary

The routes are installed but lending reads require `NEXT_PUBLIC_BUDDY_READS_ENABLED=true`. No create, edit, stage-transition, document, task, underwriting, approval, closing, funding, or communication action is introduced here.
