# CRM and deal-pipeline parity

## Source behavior preserved

- CRM is a first-class workspace, not a hidden deal subpanel.
- The borrower directory shows account identity, primary contact availability, active-deal count, and active exposure.
- Missing relationship information is labeled missing and is never inferred or mocked.
- The deal workspace is a findable list with borrower, stage, exposure, and target-close context.
- Search and stage filtering operate only on stored facts.
- Unknown stored stages remain visible rather than disappearing from the pipeline.

## Native SaaS authority

The screens use Next.js server rendering and the signed-in Supabase session. Every query includes the active organization filter. PostgreSQL RLS independently limits owners, administrators, and viewers to institution-authorized rows and ordinary lending roles to borrowers and deals connected to active assignments.

## Activation boundary

This slice adds no schema and grants no new write permissions. Both workspaces remain behind the existing default-off read capability. Merge and deployment do not authorize customer use.
