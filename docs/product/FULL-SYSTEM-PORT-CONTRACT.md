# Full-system SaaS port contract

## Product promise

Buddy LOS preserves the complete Commercial LOS product experience and capability set while replacing its platform runtime with a multi-tenant SaaS architecture. No workspace, workflow, control, or user-visible surface may be silently omitted.

## Verbatim preservation

Preserve unless an approved product decision says otherwise:

- information architecture, route intent, layouts, visual hierarchy, navigation, terminology, and interaction patterns;
- banker, team, manager, executive, administrator, CRM, portfolio, and deal workspaces;
- origination, borrower intake, underwriting, credit approval, committee, closing, funding, boarding, servicing, annual review, covenant, risk, profitability, activity, alert, and document workflows;
- calculation logic, readiness models, workflow requirements, policy controls, audit evidence, diagnostics, recovery behavior, and tests;
- default-off and fail-closed behavior where the source product requires operational certification.

## Runtime replacements

| Concern | Native SaaS authority |
|---|---|
| Website and application | Next.js on Vercel |
| Authentication | Supabase Auth |
| Tenant and record authorization | Postgres RLS plus server-side command authorization |
| Transactional records | Supabase Postgres |
| Files and generated documents | Private Supabase Storage |
| Business-rule enforcement | Postgres constraints/functions and Next.js server application services |
| Asynchronous work | Durable, idempotent job and event processing |
| External communications | Provider-neutral adapters |
| AI and document analysis | Server-only provider adapters with evidence and human-review boundaries |
| Audit and evidence | Append-only organization-scoped event records |

## Completion rule

Each subsystem needs all six forms of proof:

1. Its source UI and behavior are mapped.
2. Its native schema and authorization policies exist.
3. Server reads and governed writes are implemented.
4. Source contract tests are ported or replaced with equivalent tests.
5. Browser behavior is observed through reload, resume, concurrency, failure, and recovery paths.
6. Deployment identity and database migration identity are recorded.

## Sequence

1. Application shell, design system, identity, tenant resolution, and workspace gates.
2. Banker command center, CRM, borrower records, deal pipeline, and deal cockpit.
3. Origination intake, documents, underwriting, credit memo, approvals, and committee.
4. Closing, funding, boarding, servicing, portfolio, annual review, and covenants.
5. Team, manager, executive, administration, alerts, diagnostics, and configuration.
6. Communications, scheduling, document intelligence, AI assistance, and optional integrations.

The sequence is an implementation order, not permission to activate incomplete workflows.
