# Buddy LOS

Buddy LOS is a native, standalone commercial lending SaaS product built with Next.js, Vercel, and Supabase.

## Status

**Early foundation — not production-ready.** The website and Supabase project exist, but authentication and lending workflows remain disabled until their security gates pass.

## Local development

Requirements: Node.js 22 LTS and npm 10 or newer.

```bash
npm ci
copy .env.example .env.local
npm run dev
```

The landing page runs without Supabase credentials and reports the backend as unconfigured. This default-off behavior is intentional.

## Validation

```bash
npm run check
```

## Architecture

- [Architecture decision](docs/architecture/ADR-0001-standalone-saas-boundary.md)
- [Target architecture](docs/architecture/TARGET-SAAS-ARCHITECTURE.md)
- [Core LOS domain map](docs/architecture/CORE-LOS-DOMAIN-MAP.md)
- [Product build plan](docs/product/PRODUCT-BUILD-PLAN.md)
- [Controlled build arc](docs/product/CONTROLLED-BUILD-ARC.md)
- [Full-system port contract](docs/product/FULL-SYSTEM-PORT-CONTRACT.md)
- [Banker command-center parity](docs/product/BANKER-COMMAND-CENTER-PARITY.md)
- [Governed loan intake](docs/product/GOVERNED-LOAN-INTAKE.md)
- [CRM and deal-pipeline parity](docs/product/CRM-DEAL-PIPELINE-PARITY.md)
- [Underwriting readiness foundation](docs/product/UNDERWRITING-READINESS-FOUNDATION.md)
- [Private document foundation](docs/product/PRIVATE-DOCUMENT-FOUNDATION.md)
- [Governed document upload preparation](docs/product/DOCUMENT-UPLOAD-PREPARATION.md)
- [Document quarantine completion](docs/product/DOCUMENT-QUARANTINE-COMPLETION.md)
- [Clean document access authorization](docs/product/CLEAN-DOCUMENT-ACCESS-AUTHORIZATION.md)
- [Trusted document download exchange](docs/product/TRUSTED-DOCUMENT-DOWNLOAD-EXCHANGE.md)
- [Deal document workspace](docs/product/DEAL-DOCUMENT-WORKSPACE.md)
- [Security baseline](docs/security/SECURITY-BASELINE.md)
- [Identity and tenant gate](docs/security/IDENTITY-AND-TENANT-GATE.md)

## Product boundary

Buddy LOS owns its product model, user experience, database, website, deployment, and operating controls. No external platform schema is part of its runtime architecture.
