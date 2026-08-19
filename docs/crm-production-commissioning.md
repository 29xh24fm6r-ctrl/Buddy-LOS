# CRM production commissioning

The CRM is commissioned only when the application deployment and database migration history point to the same merged release and the transactional authorization test passes against the canonical Buddy Supabase project.

The repository migration versions intentionally match the canonical production ledger. Production-only activation and investor-demo entries are represented by inert history markers so fresh environments preserve the same version sequence without copying production identities, tenant data, or activation authority.

## Protected environment

Create a GitHub environment named `crm-production`, require a human reviewer, and store these environment secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`
- `CRM_CERT_BASE_URL`
- `CRM_CERT_OWNER_EMAIL`
- `CRM_CERT_OWNER_PASSWORD`
- `CRM_CERT_LENDER_EMAIL`
- `CRM_CERT_LENDER_PASSWORD`

Do not store these values in repository files or Vercel client-visible variables.

## Commissioning procedure

1. Merge a green CRM factory pull request.
2. Open **Actions → CRM production commissioning → Run workflow**.
3. Enter `COMMISSION_CRM` exactly.
4. Approve the protected `crm-production` environment deployment.
5. Require every workflow step to pass. The workflow previews the migration plan, applies migrations, verifies that repository and production history remain aligned, runs the authorization/lifecycle test inside a rolled-back transaction, runs the Supabase security advisor, and executes authenticated owner and lender browser journeys across every CRM workspace view.
6. Redeploy the exact merged commit to Vercel using Node 22.
7. Preserve the workflow URL and its `crm.authenticated_browser_certified` evidence event with the release record. The browser journey verifies both roles, every CRM route, and the governed operating controls against the production deployment.
8. Verify revocation: end the lender company assignment and confirm company, people, referrals, appointments, and linked relationships disappear immediately.

## Entitlement and activation parity

CRM writes require both a current `document_intake` product entitlement and an active, evidence-backed `core_operations` capability. Treat any activated tenant without that entitlement as uncommissioned, even when the application UI reports the capability as active.

Before release, require this query to return `0`:

```sql
select count(*) as uncommissioned_crm_tenants
from public.organization_capability_activations as activation
where activation.capability_key = 'core_operations'
  and activation.is_active
  and not exists (
    select 1
    from public.organization_product_modules as module
    where module.organization_id = activation.organization_id
      and module.module_key = 'document_intake'
      and module.status in ('trial', 'active')
      and module.starts_at <= now()
      and (module.ends_at is null or module.ends_at > now())
  );
```

## Release gate

Do not change `release/capability-ledger.json` from `PRE_RELEASE` or mark `crm_core` deployed/certified/active until entitlement/activation parity, the workflow URL, database migration head, Vercel deployment SHA, and authenticated browser evidence are recorded together.

## Rollback

The migration is additive. If application behavior fails after commissioning, roll the Vercel deployment back first and disable CRM writes. Do not delete CRM tables or rewrite migration history. Prepare a forward-only corrective migration, rerun the transactional certification, and recommission.
