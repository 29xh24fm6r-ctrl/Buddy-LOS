# CRM operating factory

## Commissioned scope

Buddy LOS now treats CRM as an assignment-scoped operating system rather than a directory shell. The workspace reads durable companies, contact points, borrower relationships, loan opportunities, activities, referrals, recorded meetings, and deal tasks. Home metrics and reports are derived only from those authorized ledgers.

Governed commands support company creation, typed/primary contacts, activity logging, company-to-company relationships, task creation, and optimistic-concurrency task completion. Browser-local date/time values are converted to ISO instants before submission and displayed in the institution timezone.

## Authority model

- Owners and administrators retain institution-wide operating authority.
- A lender who creates a standalone company receives a durable borrower assignment in the same command transaction and can immediately read and operate that company.
- Existing deal assignments continue to grant borrower authority through their assigned deal.
- Unassigned lenders cannot read or mutate another lender's companies, contacts, relationships, activities, or tasks.
- Direct Data API writes remain revoked. Every write is an idempotent, audited `security definer` command with tenant and object authorization.

## Activation and proof

The existing `document_intake` entitlement and `core_operations` capability gate remain mandatory. CI rebuilds Supabase from zero and exercises company ownership, primary contact creation, activity logging, relationship creation, task completion, replay/concurrency controls, and unassigned-user isolation.

## Rollback

Application rollback is safe because all changes are additive. Do not drop `borrower_assignments` during an application rollback: it is the durable authority record for standalone CRM companies. Disable the existing `core_operations` capability to stop commands while preserving reads and audit evidence.
