# ADR-0001: Standalone SaaS repository boundary

- Status: Accepted
- Date: 2026-08-11

## Decision

Buddy LOS is implemented in this repository as a standalone Next.js and Supabase product. `Commercial-LOS` remains a read-only source of product behavior, domain rules, UI patterns, test cases, and migration evidence.

No Power Apps, Dataverse, Power Pages, Power Automate, Azure, SharePoint, Entra, Outlook, Teams, or Copilot dependency is copied into the new runtime by default. Each capability must either be replaced by a platform-neutral contract or retained as an optional integration adapter.

## Consequences

- The repositories have independent histories and deployment credentials.
- Microsoft identifiers are migration aliases, not canonical SaaS keys.
- UI code may be ported only after its data and authorization dependencies are identified.
- Governance rules enforced by Dataverse plugins must be captured and proven before the corresponding write is enabled.
- Production activation is a separate decision from implementation and deployment.
