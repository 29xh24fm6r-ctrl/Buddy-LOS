# CRM production commissioning

The CRM is commissioned only when the application deployment and database migration history point to the same merged release and the transactional authorization test passes against the canonical Buddy Supabase project.

## Protected environment

Create a GitHub environment named `crm-production`, require a human reviewer, and store these environment secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`

Do not store these values in repository files or Vercel client-visible variables.

## Commissioning procedure

1. Merge a green CRM factory pull request.
2. Open **Actions → CRM production commissioning → Run workflow**.
3. Enter `COMMISSION_CRM` exactly.
4. Approve the protected `crm-production` environment deployment.
5. Require every workflow step to pass. The workflow previews the migration plan, applies migrations, verifies migration history, runs the authorization/lifecycle test inside a rolled-back transaction, and runs the Supabase security advisor.
6. Redeploy the exact merged commit to Vercel using Node 22.
7. Verify an authenticated owner and lender flow: company → detail → person → activity → relationship → referral → appointment → assigned task.
8. Verify revocation: end the lender company assignment and confirm company, people, referrals, appointments, and linked relationships disappear immediately.

## Release gate

Do not change `release/capability-ledger.json` from `PRE_RELEASE` or mark `crm_core` deployed/certified/active until the workflow URL, database migration head, Vercel deployment SHA, and authenticated browser evidence are recorded together.

## Rollback

The migration is additive. If application behavior fails after commissioning, roll the Vercel deployment back first and disable CRM writes. Do not delete CRM tables or rewrite migration history. Prepare a forward-only corrective migration, rerun the transactional certification, and recommission.
