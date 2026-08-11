# Buddy LOS

Buddy LOS is the standalone SaaS successor to the Microsoft Power Platform-based Commercial LOS. This repository targets Vercel and Supabase and is intentionally isolated from the original repository.

## Status

**Foundation only — not production-ready.** No production Supabase project, migrated customer data, Microsoft integration, or live lending workflow is connected.

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
- [Migration traceability](docs/migration/MIGRATION-TRACEABILITY-MATRIX.md)
- [Controlled build arc](docs/migration/CONTROLLED-BUILD-ARC.md)
- [Security baseline](docs/security/SECURITY-BASELINE.md)

## Repository boundary

`Commercial-LOS` is read-only reference material. Code is migrated only after it is classified as portable domain/UI logic or deliberately replaced behind a platform-neutral interface.
